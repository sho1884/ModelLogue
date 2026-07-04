"""Command-line interface for modellogue-nswitch.

See Requirements_Specification.md §3 for the full CLI contract.

Two modes: batch (the default, no subcommand) and ``serve`` (a long-
running HTTP server — see §9.2).
"""
from __future__ import annotations

import argparse
import sys

from . import __version__
from .generate import (
    coverage_to_csv,
    generate,
    tests_to_csv,
)
from .parse_csv import CsvParseError, parse_csv
from .parse_puml import PumlParseError, parse_puml


def build_serve_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="modellogue-nswitch serve",
        description=(
            "Expose the generator as an HTTP service so reactive clients "
            "(the ModelLogue GUI, CI dashboards, etc.) can call it without "
            "spawning a subprocess per request. See §9.2 of the requirements "
            "specification."
        ),
    )
    p.add_argument(
        "--host",
        default="127.0.0.1",
        help="Bind address. Default: 127.0.0.1. Use 0.0.0.0 for container use.",
    )
    p.add_argument(
        "--port",
        type=int,
        default=8090,
        help="TCP port. Default: 8090.",
    )
    p.add_argument(
        "--cors-origin",
        default="*",
        help=(
            "Value for Access-Control-Allow-Origin. Default: *. "
            "Set explicitly (e.g. http://localhost:5173) outside dev."
        ),
    )
    return p


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="modellogue-nswitch",
        description=(
            "Generate N-switch coverage test cases from a state machine "
            "described as a PlantUML source or a canonical state-transition-"
            "table CSV. Use `modellogue-nswitch serve --help` for the HTTP "
            "API mode."
        ),
    )
    p.add_argument(
        "input",
        nargs="?",
        default=None,
        help="Input file. If omitted, reads from stdin.",
    )
    p.add_argument("--version", action="version", version=f"%(prog)s {__version__}")
    p.add_argument(
        "-n",
        "--n",
        type=int,
        default=1,
        choices=(0, 1, 2),
        help="N-switch level (0, 1, or 2). Default: 1.",
    )
    p.add_argument(
        "--invalid",
        action="store_true",
        help=(
            "Also emit negative tests: one per invalid transition (empty "
            "state-table cell, §7.2). Orthogonal to -n."
        ),
    )
    p.add_argument(
        "--format",
        choices=("puml", "csv"),
        default=None,
        help="Force input format. If omitted, auto-detected.",
    )
    p.add_argument(
        "-o",
        "--output",
        default=None,
        help="Write output to FILE instead of stdout.",
    )
    p.add_argument(
        "--coverage",
        action="store_true",
        help="Emit coverage report CSV instead of test-case CSV.",
    )
    layered = p.add_mutually_exclusive_group()
    layered.add_argument(
        "--layered",
        dest="layered",
        action="store_true",
        default=True,
        help="Apply per-composite layered strategy (default).",
    )
    layered.add_argument(
        "--no-layered",
        dest="layered",
        action="store_false",
        help="Treat composites as opaque leaves (no child-layer tests).",
    )
    p.add_argument(
        "--max-cycle-unroll",
        type=int,
        default=3,
        help=(
            "Per-test cap on how many times any single transition may be "
            "traversed during path construction (§7.4). Default: 3."
        ),
    )
    p.add_argument(
        "--require-final",
        action="store_true",
        help=(
            "Exit 2 if the model has no initial→final path. Default is to "
            "accept cyclic / mainloop models and close tests on a revisited "
            "state."
        ),
    )
    return p


def main(argv: list[str] | None = None) -> int:
    if argv is None:
        argv = sys.argv[1:]

    # Pre-dispatch: `serve` is a literal first positional that switches the
    # whole parser. Keeping batch mode argparse-strict (no subparsers) avoids
    # having every batch-mode positional rejected as "not a valid subcommand".
    if argv and argv[0] == "serve":
        from .server import ServerConfig, run  # local import keeps batch mode lean

        serve_args = build_serve_parser().parse_args(argv[1:])
        run(
            ServerConfig(
                host=serve_args.host,
                port=serve_args.port,
                cors_origin=serve_args.cors_origin,
            )
        )
        return 0

    args = build_parser().parse_args(argv)

    try:
        text = _read_input(args.input)
    except OSError as e:
        print(f"Error: {args.input}: {e}", file=sys.stderr)
        return 1

    fmt = args.format or _detect_format(args.input, text)
    if fmt is None:
        print(
            "Error: cannot auto-detect format; use --format",
            file=sys.stderr,
        )
        return 1

    try:
        model = parse_puml(text) if fmt == "puml" else parse_csv(text)
    except PumlParseError as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1
    except CsvParseError as e:
        print(f"Error: CSV: {e}", file=sys.stderr)
        return 1

    try:
        result = generate(
            model,
            n=args.n,
            invalid=args.invalid,
            layered=args.layered,
            max_cycle_unroll=args.max_cycle_unroll,
            require_final=args.require_final,
        )
    except ValueError as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1

    # --require-final: if any layer reported unreachable due to missing
    # initial→final, signal exit 2. The builder prefaces that reason with
    # "--require-final:" so we can match it precisely.
    if args.require_final and any(
        u.reason.startswith("--require-final:") for u in result.uncovered
    ):
        print(
            "Error: model has no path from any initial state to any final state",
            file=sys.stderr,
        )
        return 2

    csv_text = (
        coverage_to_csv(result.coverage, result.tests)
        if args.coverage
        else tests_to_csv(result.tests)
    )

    _write_output(args.output, csv_text)

    # Warn on any remaining uncovered chains (cycle-unroll cap, etc.).
    uncovered_non_final = [
        u for u in result.uncovered if not u.reason.startswith("--require-final:")
    ]
    if uncovered_non_final:
        print(
            f"Warning: {len(uncovered_non_final)} chain(s) left uncovered due to "
            "--max-cycle-unroll cap",
            file=sys.stderr,
        )
        for u in uncovered_non_final:
            parts = [u.chain[0].source_state_id]
            for t in u.chain:
                ev = t.event if t.event else "()"
                parts.append(f"--{ev}-->")
                parts.append(t.target_state_id)
            print(f"  {u.layer_name}: {' '.join(parts)}", file=sys.stderr)
        return 3

    return 0


def _read_input(path: str | None) -> str:
    if path is None or path == "-":
        return sys.stdin.read()
    with open(path, encoding="utf-8") as fh:
        return fh.read()


def _write_output(path: str | None, content: str) -> None:
    if path is None or path == "-":
        sys.stdout.write(content)
        return
    with open(path, "w", encoding="utf-8", newline="") as fh:
        fh.write(content)


def _detect_format(path: str | None, text: str) -> str | None:
    if path:
        lower = path.lower()
        if lower.endswith((".puml", ".plantuml")):
            return "puml"
        if lower.endswith(".csv"):
            return "csv"
    for line in text.split("\n"):
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
