#!/usr/bin/env python3
"""Run a required workspace package script, failing clearly when it is absent."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path


def workspace_packages(root: Path) -> list[Path]:
    return sorted(
        path
        for pattern in ("packages/*/package.json", "apps/*/package.json")
        for path in root.glob(pattern)
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("package", help="workspace package name, for example @meraki/contracts")
    parser.add_argument("script", help="required package.json script")
    parser.add_argument("--require-env", action="append", default=[], help="required environment variable")
    args = parser.parse_args()

    root = Path(__file__).resolve().parents[2]
    missing_env = [name for name in args.require_env if not os.environ.get(name)]
    if missing_env:
        print(f"ERROR: required environment variable(s) missing: {', '.join(missing_env)}", file=sys.stderr)
        return 2

    selected: tuple[Path, dict] | None = None
    for manifest_path in workspace_packages(root):
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        except (OSError, UnicodeError, json.JSONDecodeError) as error:
            print(f"ERROR: cannot parse {manifest_path}: {error}", file=sys.stderr)
            return 2
        if manifest.get("name") == args.package:
            selected = (manifest_path, manifest)
            break

    if selected is None:
        print(f"ERROR: workspace package {args.package!r} was not found", file=sys.stderr)
        return 2
    manifest_path, manifest = selected
    scripts = manifest.get("scripts", {})
    if not isinstance(scripts, dict) or not scripts.get(args.script):
        print(
            f"ERROR: {manifest_path.relative_to(root)} must define script {args.script!r}; "
            "the owning implementation packet must provide the real check",
            file=sys.stderr,
        )
        return 2

    pnpm = shutil.which("pnpm")
    if pnpm is None:
        print("ERROR: pnpm is required to run workspace checks", file=sys.stderr)
        return 2
    command = [pnpm, "--filter", args.package, "run", args.script]
    print(f"RUN: {' '.join(command)}", flush=True)
    return subprocess.run(command, cwd=root, check=False).returncode


if __name__ == "__main__":
    raise SystemExit(main())
