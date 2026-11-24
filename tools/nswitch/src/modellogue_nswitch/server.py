"""HTTP server for the `serve` subcommand.

Implements the API described in
``Requirements_Specification.md`` §9.2, on top of the Python stdlib
``http.server`` — no runtime dependencies beyond the standard library.
"""
from __future__ import annotations

import json
import logging
import socketserver
from dataclasses import dataclass
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler

from . import __version__
from .generate import GenerationResult, generate, result_to_dict
from .parse_csv import CsvParseError, parse_csv
from .parse_puml import PumlParseError, parse_puml

log = logging.getLogger("modellogue_nswitch.server")


@dataclass(frozen=True, slots=True)
class ServerConfig:
    host: str = "127.0.0.1"
    port: int = 8090
    cors_origin: str = "*"


class _Handler(BaseHTTPRequestHandler):
    # Populated by ``make_server`` so handlers can read CORS / version info.
    config: ServerConfig  # type: ignore[misc]

    server_version = f"modellogue-nswitch/{__version__}"

    # Silence default request-logging onto stderr; emit only structured logs
    # and error messages via the `log` logger.
    def log_message(self, fmt: str, *args) -> None:  # noqa: D401
        log.info("%s - %s", self.address_string(), fmt % args)

    # ----- dispatch -----

    def do_OPTIONS(self) -> None:  # noqa: N802
        self._cors_preflight()

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/health":
            self._send_json(
                HTTPStatus.OK,
                {"status": "ok", "version": __version__},
            )
            return
        self._send_error(
            HTTPStatus.NOT_FOUND, "not_found", f"no GET endpoint at {self.path}"
        )

    def do_POST(self) -> None:  # noqa: N802
        if self.path == "/generate":
            self._handle_generate()
            return
        self._send_error(
            HTTPStatus.NOT_FOUND, "not_found", f"no POST endpoint at {self.path}"
        )

    # ----- /generate -----

    def _handle_generate(self) -> None:
        body = self._read_json_body()
        if body is None:
            return  # error already sent

        unknown = sorted(set(body) - _GENERATE_FIELDS)
        if unknown:
            self._send_error(
                HTTPStatus.BAD_REQUEST,
                "invalid_request",
                "unknown field(s): " + ", ".join(f"`{k}`" for k in unknown),
            )
            return

        source = body.get("source")
        if not isinstance(source, str) or not source.strip():
            self._send_error(
                HTTPStatus.BAD_REQUEST,
                "invalid_request",
                "`source` is required and must be a non-empty string",
            )
            return

        fmt = body.get("format")
        if fmt not in (None, "puml", "csv"):
            self._send_error(
                HTTPStatus.BAD_REQUEST,
                "invalid_request",
                "`format` must be 'puml', 'csv', or null",
            )
            return
        resolved_fmt = fmt or _detect_format(source)
        if resolved_fmt is None:
            self._send_error(
                HTTPStatus.BAD_REQUEST,
                "invalid_request",
                "cannot auto-detect format; set `format` explicitly",
            )
            return

        n = body.get("n", 1)
        if n not in (0, 1, 2):
            self._send_error(
                HTTPStatus.BAD_REQUEST,
                "invalid_request",
                f"`n` must be 0, 1, or 2 (got {n!r})",
            )
            return

        layered = body.get("layered", True)
        if not isinstance(layered, bool):
            self._send_error(
                HTTPStatus.BAD_REQUEST,
                "invalid_request",
                "`layered` must be boolean",
            )
            return

        invalid = body.get("invalid", False)
        if not isinstance(invalid, bool):
            self._send_error(
                HTTPStatus.BAD_REQUEST,
                "invalid_request",
                "`invalid` must be boolean",
            )
            return

        name = body.get("name", "untitled")
        if not isinstance(name, str) or not name:
            self._send_error(
                HTTPStatus.BAD_REQUEST,
                "invalid_request",
                "`name` must be a non-empty string",
            )
            return

        require_final = body.get("require_final", False)
        if not isinstance(require_final, bool):
            self._send_error(
                HTTPStatus.BAD_REQUEST,
                "invalid_request",
                "`require_final` must be boolean",
            )
            return

        try:
            model = (
                parse_puml(source)
                if resolved_fmt == "puml"
                else parse_csv(source)
            )
        except PumlParseError as e:
            self._send_error(HTTPStatus.BAD_REQUEST, "parse_error", str(e))
            return
        except CsvParseError as e:
            self._send_error(HTTPStatus.BAD_REQUEST, "parse_error", f"CSV: {e}")
            return

        try:
            result: GenerationResult = generate(
                model,
                n=n,
                invalid=invalid,
                name=name,
                layered=layered,
                require_final=require_final,
            )
        except ValueError as e:
            self._send_error(HTTPStatus.BAD_REQUEST, "invalid_request", str(e))
            return
        except Exception:  # pragma: no cover — unexpected
            log.exception("internal error while generating")
            self._send_error(
                HTTPStatus.INTERNAL_SERVER_ERROR,
                "internal_error",
                "generate() failed; see server logs",
            )
            return

        # --require-final with no init→final path surfaces in result.uncovered
        # with reason prefix "--require-final:" (see algorithm.build_tests).
        if require_final and any(
            u.reason.startswith("--require-final:") for u in result.uncovered
        ):
            self._send_error(
                HTTPStatus.UNPROCESSABLE_ENTITY,
                "unsatisfiable",
                "model has no path from any initial state to any final state",
            )
            return

        self._send_json(HTTPStatus.OK, result_to_dict(result))

    # ----- I/O helpers -----

    def _read_json_body(self) -> dict | None:
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0:
            self._send_error(
                HTTPStatus.BAD_REQUEST,
                "invalid_request",
                "empty request body",
            )
            return None
        raw = self.rfile.read(length)
        try:
            data = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as e:
            self._send_error(
                HTTPStatus.BAD_REQUEST,
                "invalid_request",
                f"malformed JSON: {e}",
            )
            return None
        if not isinstance(data, dict):
            self._send_error(
                HTTPStatus.BAD_REQUEST,
                "invalid_request",
                "request body must be a JSON object",
            )
            return None
        return data

    def _send_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def _send_error(self, status: int, type_: str, message: str) -> None:
        self._send_json(status, {"error": {"type": type_, "message": message}})

    def _cors_preflight(self) -> None:
        self.send_response(HTTPStatus.NO_CONTENT)
        self._cors_headers()
        self.end_headers()

    def _cors_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", self.config.cors_origin)
        self.send_header(
            "Access-Control-Allow-Methods", "GET, POST, OPTIONS"
        )
        self.send_header("Access-Control-Allow-Headers", "Content-Type")


# Request fields accepted by POST /generate (§9.2.2). Anything else is
# rejected as `invalid_request` (§9.2.4).
_GENERATE_FIELDS = frozenset(
    {"source", "format", "n", "invalid", "name", "layered", "require_final"}
)


class _ThreadingServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    """One thread per request. ``allow_reuse_address`` avoids TIME_WAIT pain."""

    daemon_threads = True
    allow_reuse_address = True


def _detect_format(source: str) -> str | None:
    for line in source.split("\n"):
        s = line.strip()
        # Skip blank lines and leading comments ('/# ), so a diagram with a
        # header comment block before @startuml is still detected as puml.
        # This matches the ModelLogue TypeScript parser, which tolerates the
        # same front matter.
        if not s or s.startswith("'") or s.startswith("#"):
            continue
        if s.startswith("@startuml"):
            return "puml"
        return "csv"
    return None


def make_server(config: ServerConfig) -> _ThreadingServer:
    handler_cls = type(
        "_BoundHandler",
        (_Handler,),
        {"config": config},
    )
    return _ThreadingServer((config.host, config.port), handler_cls)


def run(config: ServerConfig) -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(name)s] %(levelname)s %(message)s",
    )
    with make_server(config) as httpd:
        log.info(
            "modellogue-nswitch %s serving on http://%s:%d",
            __version__,
            config.host,
            config.port,
        )
        log.info("CORS Access-Control-Allow-Origin: %s", config.cors_origin)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            log.info("shutting down")
