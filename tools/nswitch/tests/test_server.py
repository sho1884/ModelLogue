"""HTTP API tests (§9.2).

Each test spins up a real ThreadingTCPServer on a fresh port, exercises
it via ``urllib``, and tears it down. That matches the on-the-wire
semantics better than monkeypatching handler internals.
"""
import json
import socket
import threading
import urllib.error
import urllib.request
from contextlib import closing, contextmanager

import pytest

from modellogue_nswitch.server import ServerConfig, make_server


@contextmanager
def running_server(cors_origin: str = "*"):
    with closing(socket.socket(socket.AF_INET, socket.SOCK_STREAM)) as s:
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]
    config = ServerConfig(host="127.0.0.1", port=port, cors_origin=cors_origin)
    httpd = make_server(config)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{port}"
    finally:
        httpd.shutdown()
        httpd.server_close()


def _get(url: str) -> tuple[int, dict | None, dict[str, str]]:
    try:
        with urllib.request.urlopen(url) as resp:
            body = json.loads(resp.read().decode("utf-8"))
            return resp.status, body, dict(resp.headers)
    except urllib.error.HTTPError as e:
        body = json.loads(e.read().decode("utf-8"))
        return e.code, body, dict(e.headers)


def _post(url: str, body: dict | str) -> tuple[int, dict | None, dict[str, str]]:
    data = body if isinstance(body, bytes) else (
        body.encode("utf-8") if isinstance(body, str) else json.dumps(body).encode("utf-8")
    )
    req = urllib.request.Request(
        url, data=data, headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
            return resp.status, payload, dict(resp.headers)
    except urllib.error.HTTPError as e:
        payload = json.loads(e.read().decode("utf-8"))
        return e.code, payload, dict(e.headers)


def _options(url: str) -> tuple[int, dict[str, str]]:
    req = urllib.request.Request(url, method="OPTIONS")
    with urllib.request.urlopen(req) as resp:
        return resp.status, dict(resp.headers)


PUML_MIN = "@startuml\n[*] --> A\nA --> [*] : done\n@enduml\n"


def test_health():
    with running_server() as base:
        status, body, headers = _get(f"{base}/health")
        assert status == 200
        assert body["status"] == "ok"
        assert "version" in body
        assert headers["Access-Control-Allow-Origin"] == "*"


def test_generate_puml_default_n_1():
    with running_server() as base:
        status, body, _ = _post(f"{base}/generate", {"source": PUML_MIN})
        assert status == 200
        assert body["layers"] == ["top"]
        assert body["tests"]
        assert body["tests"][0]["test_id"].startswith("top-")


def test_generate_csv_input_explicit_format():
    csv_text = (
        "state,label,parent,type,initial,go\n"
        "A,,,normal,Y,B\n"
        "B,,,normal,,\n"
    )
    with running_server() as base:
        status, body, _ = _post(
            f"{base}/generate",
            {"source": csv_text, "format": "csv", "n": 0},
        )
        assert status == 200
        assert body["tests"]


def test_generate_rejects_missing_source():
    with running_server() as base:
        status, body, _ = _post(f"{base}/generate", {"n": 1})
        assert status == 400
        assert body["error"]["type"] == "invalid_request"


def test_generate_rejects_bad_n():
    with running_server() as base:
        status, body, _ = _post(f"{base}/generate", {"source": PUML_MIN, "n": 5})
        assert status == 400
        assert body["error"]["type"] == "invalid_request"


def test_generate_rejects_bad_format():
    with running_server() as base:
        status, body, _ = _post(
            f"{base}/generate", {"source": PUML_MIN, "format": "xml"}
        )
        assert status == 400
        assert body["error"]["type"] == "invalid_request"


def test_generate_parse_error_returns_400():
    bad = "@startuml\nnonsense garbage line\n@enduml\n"
    with running_server() as base:
        status, body, _ = _post(f"{base}/generate", {"source": bad})
        assert status == 400
        assert body["error"]["type"] == "parse_error"
        assert "line" in body["error"]["message"]


def test_generate_malformed_json_returns_400():
    with running_server() as base:
        status, body, _ = _post(f"{base}/generate", "this is not json")
        assert status == 400
        assert body["error"]["type"] == "invalid_request"


def test_generate_empty_body_returns_400():
    with running_server() as base:
        req = urllib.request.Request(
            f"{base}/generate", data=b"", headers={"Content-Type": "application/json"}
        )
        try:
            with urllib.request.urlopen(req):
                pytest.fail("expected HTTPError")
        except urllib.error.HTTPError as e:
            body = json.loads(e.read().decode("utf-8"))
            assert e.code == 400
            assert body["error"]["type"] == "invalid_request"


def test_generate_require_final_unsatisfiable_returns_422():
    puml = "@startuml\n[*] --> A\nA --> A : loop\n@enduml\n"
    with running_server() as base:
        status, body, _ = _post(
            f"{base}/generate",
            {"source": puml, "require_final": True},
        )
        assert status == 422
        assert body["error"]["type"] == "unsatisfiable"


def test_cors_preflight():
    with running_server(cors_origin="http://localhost:5173") as base:
        status, headers = _options(f"{base}/generate")
        assert status == 204
        assert headers["Access-Control-Allow-Origin"] == "http://localhost:5173"
        assert "POST" in headers["Access-Control-Allow-Methods"]


def test_unknown_endpoint_returns_404():
    with running_server() as base:
        status, body, _ = _get(f"{base}/does-not-exist")
        assert status == 404
        assert body["error"]["type"] == "not_found"
