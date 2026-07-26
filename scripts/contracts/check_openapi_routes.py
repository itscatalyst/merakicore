from __future__ import annotations

import re
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
ROUTER = ROOT / "apps" / "api" / "src" / "index.ts"
OPENAPI = ROOT / "api" / "openapi.yaml"
HTTP_METHODS = {"get", "post", "put", "patch", "delete"}


def normalize_fastify_path(path: str) -> str:
    return re.sub(r":([A-Za-z0-9_]+)", r"{\1}", path)


def router_operations(source: str) -> set[tuple[str, str]]:
    operations: set[tuple[str, str]] = set()
    for method_match in re.finditer(r"server\.(get|post|put|patch|delete)\b", source):
        tail = source[method_match.end() : method_match.end() + 1200]
        path_match = re.search(r'\(\s*"(/[^"]+)"', tail)
        if path_match is None:
            raise RuntimeError(f"Could not resolve route after {method_match.group(0)}")
        operations.add((method_match.group(1), normalize_fastify_path(path_match.group(1))))
    return operations


def openapi_operations(document: dict[str, object]) -> set[tuple[str, str]]:
    paths = document.get("paths")
    if not isinstance(paths, dict):
        raise RuntimeError("OpenAPI paths object is missing")
    return {
        (method, path)
        for path, item in paths.items()
        if isinstance(path, str) and isinstance(item, dict)
        for method in item
        if method in HTTP_METHODS
    }


def main() -> None:
    source = ROUTER.read_text(encoding="utf-8")
    document = yaml.safe_load(OPENAPI.read_text(encoding="utf-8"))
    if not isinstance(document, dict):
        raise RuntimeError("OpenAPI document must be an object")
    router = router_operations(source)
    specification = openapi_operations(document)
    missing = sorted(router - specification)
    fictional = sorted(specification - router)
    if missing or fictional:
        lines = ["OpenAPI and Fastify routes differ."]
        if missing:
            lines.append(f"Missing from OpenAPI: {missing}")
        if fictional:
            lines.append(f"Documented but not implemented: {fictional}")
        raise SystemExit("\n".join(lines))
    print(f"OpenAPI route parity: {len(router)} operations")


if __name__ == "__main__":
    main()
