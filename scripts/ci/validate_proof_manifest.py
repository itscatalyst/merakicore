#!/usr/bin/env python3
"""Validate Meraki proof manifests against the canonical proof schema."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

try:
    import yaml
    from jsonschema import Draft202012Validator, FormatChecker
    from jsonschema.exceptions import SchemaError
except ImportError as error:  # pragma: no cover
    print(f"ERROR: missing Python validation dependency: {error.name}", file=sys.stderr)
    print("Install with: python -m pip install PyYAML jsonschema", file=sys.stderr)
    raise SystemExit(2)


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SCHEMA = ROOT / "ops/proof/proof-manifest.schema.json"
DEFAULT_MANIFEST = ROOT / "ops/proof/proof-manifest.template.yaml"


def load_document(path: Path) -> object:
    text = path.read_text(encoding="utf-8")
    return json.loads(text) if path.suffix.lower() == ".json" else yaml.safe_load(text)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifests", nargs="*", type=Path, default=[DEFAULT_MANIFEST])
    parser.add_argument("--schema", type=Path, default=DEFAULT_SCHEMA)
    args = parser.parse_args()
    try:
        schema = load_document(args.schema)
        Draft202012Validator.check_schema(schema)
    except (OSError, UnicodeError, json.JSONDecodeError, yaml.YAMLError, SchemaError) as error:
        print(f"ERROR: invalid proof schema {args.schema}: {error}", file=sys.stderr)
        return 2

    validator = Draft202012Validator(schema, format_checker=FormatChecker())
    failed = False
    for manifest_path in args.manifests:
        try:
            manifest = load_document(manifest_path)
        except (OSError, UnicodeError, json.JSONDecodeError, yaml.YAMLError) as error:
            print(f"ERROR: cannot load proof manifest {manifest_path}: {error}", file=sys.stderr)
            failed = True
            continue
        errors = sorted(validator.iter_errors(manifest), key=lambda item: list(item.absolute_path))
        if errors:
            failed = True
            for error in errors:
                location = ".".join(str(part) for part in error.absolute_path) or "<root>"
                print(f"ERROR: {manifest_path}:{location}: {error.message}", file=sys.stderr)
        else:
            print(f"OK: {manifest_path} validates against {args.schema}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
