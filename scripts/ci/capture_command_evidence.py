#!/usr/bin/env python3
"""Record immutable command transcripts or verify proof-manifest SHA references."""

from __future__ import annotations

import argparse
import hashlib
import os
import re
import subprocess
import sys
from pathlib import Path

try:
    import yaml
except ImportError:  # pragma: no cover
    print("ERROR: PyYAML is required: python -m pip install PyYAML", file=sys.stderr)
    raise SystemExit(2)


ROOT = Path(__file__).resolve().parents[2]
EVIDENCE_DIRECTORY = ROOT / "ops/proof/evidence"


def relative(path: Path) -> str:
    return path.resolve().relative_to(ROOT).as_posix()


def load_manifest(path: Path) -> dict:
    document = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(document, dict):
        raise ValueError("manifest root must be a mapping")
    return document


def write_manifest(path: Path, manifest: dict) -> None:
    rendered = yaml.safe_dump(manifest, sort_keys=False, allow_unicode=True, width=120)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(rendered, encoding="utf-8", newline="\n")
    os.replace(temporary, path)


def transcript(command: list[str], result: subprocess.CompletedProcess[str]) -> bytes:
    def normalize(value: str) -> str:
        return value.replace("\r\n", "\n").replace("\r", "\n")

    content = "\n".join(
        [
            "meraki-command-evidence-v1",
            f"command: {yaml.safe_dump(command, default_flow_style=True).strip()}",
            f"exit_code: {result.returncode}",
            "stdout:",
            normalize(result.stdout),
            "stderr:",
            normalize(result.stderr),
        ]
    )
    return content.rstrip().encode("utf-8") + b"\n"


def record(args: argparse.Namespace) -> int:
    manifest_path = args.manifest.resolve()
    manifest = load_manifest(manifest_path)
    command = list(args.command)
    if command and command[0] == "--":
        command.pop(0)
    if not command:
        print("ERROR: record requires a command after --", file=sys.stderr)
        return 2
    result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True, check=False)
    content = transcript(command, result)
    digest = hashlib.sha256(content).hexdigest()
    safe_name = re.sub(r"[^a-z0-9-]+", "-", args.name.lower()).strip("-")
    if not safe_name:
        print("ERROR: evidence name must contain letters or digits", file=sys.stderr)
        return 2
    EVIDENCE_DIRECTORY.mkdir(parents=True, exist_ok=True)
    evidence_path = EVIDENCE_DIRECTORY / f"{safe_name}-{digest}.txt"
    if evidence_path.exists() and evidence_path.read_bytes() != content:
        print(f"ERROR: hash collision or modified evidence file: {evidence_path}", file=sys.stderr)
        return 2
    if not evidence_path.exists():
        evidence_path.write_bytes(content)

    command_text = " ".join(command)
    commands = manifest.setdefault("commands", [])
    existing = next((entry for entry in commands if entry.get("command") == command_text), None)
    new_reference = relative(evidence_path)
    if existing is not None and existing.get("output_artifact") not in (None, new_reference):
        if not args.replace_reference:
            print("ERROR: existing command evidence differs; use --replace-reference explicitly", file=sys.stderr)
            return 2
    if existing is None:
        existing = {"command": command_text}
        commands.append(existing)
    existing.update(exit_code=result.returncode, passed=result.returncode == 0, output_artifact=new_reference)
    artifacts = manifest.setdefault("artifacts", [])
    artifacts[:] = [entry for entry in artifacts if entry.get("path") != new_reference]
    artifacts.append({"path": new_reference, "sha256": digest, "description": f"Captured output for {command_text}"})
    write_manifest(manifest_path, manifest)
    sys.stdout.write(result.stdout)
    sys.stderr.write(result.stderr)
    print(f"EVIDENCE: {new_reference} sha256={digest}")
    return result.returncode


def verify(args: argparse.Namespace) -> int:
    manifest = load_manifest(args.manifest.resolve())
    failed = False
    artifacts = manifest.get("artifacts", [])
    artifact_paths = {entry.get("path") for entry in artifacts if isinstance(entry, dict)}
    for entry in artifacts:
        path_text = entry.get("path")
        expected = entry.get("sha256")
        path = ROOT / path_text if isinstance(path_text, str) else None
        if path is None or not path.is_file():
            print(f"ERROR: missing proof artifact: {path_text!r}", file=sys.stderr)
            failed = True
            continue
        actual = hashlib.sha256(path.read_bytes()).hexdigest()
        if actual != expected:
            print(f"ERROR: SHA mismatch for {path_text}: expected {expected}, got {actual}", file=sys.stderr)
            failed = True
    for entry in manifest.get("commands", []):
        output = entry.get("output_artifact")
        if output is not None and output not in artifact_paths:
            print(f"ERROR: command output reference is absent from artifacts: {output}", file=sys.stderr)
            failed = True
    if failed:
        return 1
    print(f"OK: all SHA and command-output references verify for {args.manifest}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="mode", required=True)
    record_parser = subparsers.add_parser("record")
    record_parser.add_argument("--name", required=True)
    record_parser.add_argument("--manifest", type=Path, required=True)
    record_parser.add_argument("--replace-reference", action="store_true")
    record_parser.add_argument("command", nargs=argparse.REMAINDER)
    verify_parser = subparsers.add_parser("verify")
    verify_parser.add_argument("--manifest", type=Path, required=True)
    args = parser.parse_args()
    return record(args) if args.mode == "record" else verify(args)


if __name__ == "__main__":
    raise SystemExit(main())
