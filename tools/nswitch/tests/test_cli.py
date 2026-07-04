"""CLI integration tests."""
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
SRC_DIR = REPO_ROOT / "src"


def _run(args, stdin: str | None = None) -> subprocess.CompletedProcess:
    env = {"PYTHONPATH": str(SRC_DIR)}
    return subprocess.run(
        [sys.executable, "-m", "modellogue_nswitch", *args],
        input=stdin,
        capture_output=True,
        text=True,
        env={**env, "PATH": _path_env()},
    )


def _path_env() -> str:
    import os

    return os.environ.get("PATH", "")


def test_cli_puml_file_produces_test_case_csv(tmp_path: Path):
    puml = tmp_path / "sample.puml"
    puml.write_text(
        "@startuml\n"
        "[*] --> A\n"
        "A --> B : go\n"
        "B --> [*] : done\n"
        "@enduml\n"
    )
    r = _run([str(puml)])
    assert r.returncode == 0
    assert r.stdout.splitlines()[0] == (
        "test_id,layer,length,start,sequence,end,covers"
    )


def test_cli_stdin_auto_detects_puml():
    source = (
        "@startuml\n"
        "[*] --> A\n"
        "A --> [*] : done\n"
        "@enduml\n"
    )
    r = _run([], stdin=source)
    assert r.returncode == 0
    assert "test_id" in r.stdout


def test_cli_stdin_auto_detects_puml_with_leading_comment():
    # Leading '/# comments before @startuml must still auto-detect as puml.
    source = (
        "' header comment\n"
        "# another comment\n"
        "\n"
        "@startuml\n"
        "[*] --> A\n"
        "A --> [*] : done\n"
        "@enduml\n"
    )
    r = _run([], stdin=source)
    assert r.returncode == 0
    assert "test_id" in r.stdout


def test_cli_csv_input_via_format_flag():
    csv_text = (
        "state,label,parent,type,initial,go\n"
        "A,,,normal,Y,B\n"
        "B,,,normal,,\n"
    )
    r = _run(["--format", "csv"], stdin=csv_text)
    assert r.returncode == 0


def test_cli_coverage_report_mode():
    puml = (
        "@startuml\n"
        "[*] --> A\n"
        "A --> B : go\n"
        "B --> [*] : done\n"
        "@enduml\n"
    )
    r = _run(["--coverage"], stdin=puml)
    assert r.returncode == 0
    assert r.stdout.startswith("kind,layer,element,")


def test_cli_output_file_writes_csv(tmp_path: Path):
    puml = "@startuml\n[*] --> A\nA --> [*] : done\n@enduml\n"
    out = tmp_path / "out.csv"
    r = _run(["-o", str(out)], stdin=puml)
    assert r.returncode == 0
    assert r.stdout == ""
    assert out.read_text().startswith("test_id,")


def test_cli_require_final_exit_code_2_when_no_final_reachable():
    puml = (
        "@startuml\n"
        "[*] --> A\n"
        "A --> A : loop\n"
        "@enduml\n"
    )
    r = _run(["--require-final"], stdin=puml)
    assert r.returncode == 2
    assert "no path" in r.stderr.lower()


def test_cli_default_accepts_mainloop_models():
    puml = (
        "@startuml\n"
        "[*] --> A\n"
        "A --> B : tick\n"
        "B --> A : tock\n"
        "@enduml\n"
    )
    r = _run([], stdin=puml)
    assert r.returncode == 0
    assert "test_id" in r.stdout


def test_cli_invalid_n_value():
    r = _run(["-n", "5"], stdin="@startuml\n[*] --> A\n@enduml\n")
    assert r.returncode == 2  # argparse returns 2 for usage errors
    assert "invalid choice" in r.stderr.lower() or "choose from" in r.stderr.lower()


def test_cli_version_flag():
    r = _run(["--version"])
    assert r.returncode == 0
    assert "modellogue-nswitch" in r.stdout
