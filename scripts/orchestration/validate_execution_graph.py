#!/usr/bin/env python3
"""Read-only structural and DAG validator for config/execution_graph.yaml."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

try:
    import yaml
except ImportError:  # pragma: no cover - environment failure path
    print("ERROR: PyYAML is required: python -m pip install PyYAML", file=sys.stderr)
    raise SystemExit(2)


def fail(message: str) -> None:
    print(f"ERROR: {message}", file=sys.stderr)


def as_items(value: object, label: str) -> list[dict]:
    if isinstance(value, list) and all(isinstance(item, dict) for item in value):
        return value
    if isinstance(value, dict):
        items = []
        for key, item in value.items():
            if not isinstance(item, dict):
                raise ValueError(f"{label}.{key} must be a mapping")
            copy = dict(item)
            copy.setdefault("id", key)
            items.append(copy)
        return items
    raise ValueError(f"top-level '{label}' must be a list or mapping")


def ids(items: list[dict], label: str) -> tuple[set[str], list[str]]:
    found: set[str] = set()
    errors: list[str] = []
    for index, item in enumerate(items):
        item_id = item.get("id")
        if not isinstance(item_id, str) or not item_id:
            errors.append(f"{label}[{index}] has no non-empty string id")
        elif item_id in found:
            errors.append(f"duplicate {label} id: {item_id}")
        else:
            found.add(item_id)
    return found, errors


def detect_cycles(dependencies: dict[str, list[str]]) -> list[str]:
    visiting: set[str] = set()
    visited: set[str] = set()
    trail: list[str] = []
    cycles: list[str] = []

    def visit(node: str) -> None:
        if node in visiting:
            start = trail.index(node)
            cycles.append(" -> ".join(trail[start:] + [node]))
            return
        if node in visited:
            return
        visiting.add(node)
        trail.append(node)
        for dependency in dependencies.get(node, []):
            visit(dependency)
        trail.pop()
        visiting.remove(node)
        visited.add(node)

    for node in dependencies:
        visit(node)
    return cycles


def validate(path: Path) -> list[str]:
    if not path.is_file():
        return [
            f"execution graph not found at '{path}'. "
            "The principal architect must create config/execution_graph.yaml before DAG validation can pass."
        ]
    try:
        document = yaml.safe_load(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, yaml.YAMLError) as error:
        return [f"cannot read valid YAML from '{path}': {error}"]
    if not isinstance(document, dict):
        return ["execution graph root must be a mapping"]

    errors: list[str] = []
    version = document.get("version")
    if not isinstance(version, int) or version < 1:
        errors.append("execution graph version must be a positive integer")
    if document.get("goal_id") != "meraki-core-studio-foundation":
        errors.append("execution graph goal_id must equal meraki-core-studio-foundation")
    try:
        gates = as_items(document.get("gates"), "gates")
    except ValueError as error:
        return errors + [str(error)]

    raw_packets = document.get("packets")
    if raw_packets is not None:
        try:
            packets = as_items(raw_packets, "packets")
        except ValueError as error:
            return errors + [str(error)]
    else:
        packets = []
        for gate in gates:
            gate_id = gate.get("id", "<unknown>")
            nested = gate.get("packets", [])
            if not isinstance(nested, list) or not all(isinstance(item, dict) for item in nested):
                errors.append(f"gate {gate_id}.packets must be a mapping list")
                continue
            for packet in nested:
                copy = dict(packet)
                copy.setdefault("gate", gate_id)
                packets.append(copy)

    gate_ids, gate_errors = ids(gates, "gate")
    packet_ids, packet_errors = ids(packets, "packet")
    errors.extend(gate_errors + packet_errors)
    dependencies: dict[str, list[str]] = {}

    for packet in packets:
        packet_id = packet.get("id")
        if not isinstance(packet_id, str) or not packet_id:
            continue
        gate_id = packet.get("gate")
        if gate_id not in gate_ids:
            errors.append(f"packet {packet_id} references unknown gate: {gate_id!r}")
        depends_on = packet.get("depends_on", [])
        if not isinstance(depends_on, list) or not all(isinstance(dep, str) for dep in depends_on):
            errors.append(f"packet {packet_id}.depends_on must be a string list")
            continue
        dependencies[packet_id] = depends_on
        for dependency in depends_on:
            if dependency not in packet_ids:
                errors.append(f"packet {packet_id} depends on unknown packet: {dependency}")
            if dependency == packet_id:
                errors.append(f"packet {packet_id} depends on itself")

    gate_dependencies: dict[str, list[str]] = {}
    for gate in gates:
        gate_id = gate.get("id", "<unknown>")
        required = gate.get("required_packets")
        if required is None:
            required = [packet.get("id") for packet in packets if packet.get("gate") == gate_id]
        elif not isinstance(required, list) or not all(isinstance(item, str) for item in required):
            errors.append(f"gate {gate_id}.required_packets must be a string list")
            required = []
        for packet_id in required:
            if packet_id not in packet_ids:
                errors.append(f"gate {gate_id} requires unknown packet: {packet_id}")
        accepted = gate.get("requires_accepted_gates")
        if accepted is None:
            core_gate = gate.get("requires_core_gate")
            accepted = [] if core_gate is None else [core_gate]
        if not isinstance(accepted, list) or not all(isinstance(item, str) for item in accepted):
            errors.append(f"gate {gate_id}.requires_accepted_gates must be a string list")
            accepted = []
        gate_dependencies[str(gate_id)] = accepted
        for dependency in accepted:
            if dependency not in gate_ids:
                errors.append(f"gate {gate_id} requires unknown accepted gate: {dependency}")
            if dependency == gate_id:
                errors.append(f"gate {gate_id} requires itself")

    errors.extend(f"packet dependency cycle: {cycle}" for cycle in detect_cycles(dependencies))
    errors.extend(f"gate dependency cycle: {cycle}" for cycle in detect_cycles(gate_dependencies))
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--path",
        type=Path,
        default=Path("config/execution_graph.yaml"),
        help="execution graph path (default: config/execution_graph.yaml)",
    )
    args = parser.parse_args()
    errors = validate(args.path)
    if errors:
        for error in errors:
            fail(error)
        return 1
    print(f"OK: {args.path} contains a valid, acyclic gate/packet graph")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
