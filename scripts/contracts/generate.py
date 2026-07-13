"""Deterministically generate TypeScript wire types from the canonical schema."""
from __future__ import annotations
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCHEMA = ROOT / "schemas" / "meraki.schema.json"
OUTPUT = ROOT / "packages" / "contracts" / "src" / "generated.ts"
BANNER = "/* GENERATED from schemas/meraki.schema.json. DO NOT EDIT. */\n"

def ts(node: dict) -> str:
    if "$ref" in node: return node["$ref"].split("/")[-1]
    if "const" in node: return json.dumps(node["const"])
    if "enum" in node: return " | ".join(json.dumps(value) for value in node["enum"])
    if "oneOf" in node: return " | ".join(ts(item) for item in node["oneOf"])
    if "allOf" in node and not node.get("type"):
        parts = [ts(item) for item in node["allOf"] if item.get("type") or item.get("$ref")]
        return " & ".join(parts) or "unknown"
    kind = node.get("type")
    if kind == "string": return "string"
    if kind in ("integer", "number"): return "number"
    if kind == "boolean": return "boolean"
    if kind == "null": return "null"
    if kind == "array": return f"Array<{ts(node.get('items', {}))}>"
    if kind == "object" or "properties" in node:
        properties = node.get("properties", {})
        if not properties:
            return "Record<string, never>" if node.get("additionalProperties") is False else "Record<string, unknown>"
        required = set(node.get("required", []))
        fields = [f"  {json.dumps(name)}{' ' if name in required else '?'}: {ts(value)};" for name, value in properties.items()]
        additional = node.get("additionalProperties")
        if isinstance(additional, dict): fields.append(f"  [key: string]: {ts(additional)};")
        return "{\n" + "\n".join(fields) + "\n}"
    return "unknown"

def render() -> str:
    schema = json.loads(SCHEMA.read_text(encoding="utf-8"))
    definitions = schema["$defs"]
    names = [item["$ref"].split("/")[-1] for item in schema["oneOf"]]
    support = [name for name in definitions if name not in names]
    blocks = [f"export type {name} = {ts(definitions[name])};" for name in support + names]
    blocks.append("export type MerakiContract = " + " | ".join(names) + ";")
    return BANNER + "\n\n".join(blocks) + "\n"

if __name__ == "__main__":
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(render(), encoding="utf-8")
    print(f"generated {OUTPUT.relative_to(ROOT)}")
