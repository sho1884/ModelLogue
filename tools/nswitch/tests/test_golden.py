"""Golden output shared with the GUI (ADR-011: CLI and GUI CSV are byte-identical).

``tests/golden/nswitch-library/`` (repo root) holds the library-loan model of
§7.4.1 and the result / CSVs generate.py produces for it at n=0. The GUI's
serializer test (tests/unit/testCasesSerializer.test.ts) checks its CSV against
the same files. To regenerate after an intentional format change, write the
three files from ``generate(parse_puml(model.puml), n=0, name="lib")``.
"""
import json
from pathlib import Path

from modellogue_nswitch import generate, parse_puml
from modellogue_nswitch.generate import result_to_dict, scenarios_to_csv, tests_to_csv

GOLDEN = Path(__file__).resolve().parents[3] / "tests" / "golden" / "nswitch-library"


def _result():
    return generate(parse_puml((GOLDEN / "model.puml").read_text(encoding="utf-8")), n=0, name="lib")


def test_result_json_matches_golden():
    expected = json.loads((GOLDEN / "n0.result.json").read_text(encoding="utf-8"))
    assert result_to_dict(_result()) == expected


def test_csv_matches_golden():
    r = _result()
    assert tests_to_csv(r.tests) == (GOLDEN / "n0.tests.csv").read_text(encoding="utf-8")
    assert scenarios_to_csv(r.scenarios) == (GOLDEN / "n0.scenarios.csv").read_text(encoding="utf-8")
