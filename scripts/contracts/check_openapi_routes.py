from __future__ import annotations

import re
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
ROUTER = ROOT / "apps" / "api" / "src" / "index.ts"
HOSTED_ROUTER = ROOT / "apps" / "hosted" / "src" / "rest.ts"
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


def hosted_router_operations(source: str) -> set[tuple[str, str]]:
    operations = {
        (method.lower(), path)
        for method, path in re.findall(
            r'\{\s*method:\s*"(GET|POST|PUT|PATCH|DELETE)",\s*path:\s*"(/[^"]+)"\s*\}',
            source,
        )
    }
    if not operations:
        raise RuntimeError("Could not resolve hosted REST operation manifest")
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
    hosted_router = hosted_router_operations(HOSTED_ROUTER.read_text(encoding="utf-8"))
    specification = openapi_operations(document)
    local_missing = sorted(router - specification)
    local_fictional = sorted(specification - router)
    hosted_missing = sorted(hosted_router - specification)
    hosted_fictional = sorted(specification - hosted_router)
    if local_missing or local_fictional or hosted_missing or hosted_fictional:
        lines = ["OpenAPI, Fastify, and hosted REST routes differ."]
        if local_missing:
            lines.append(f"Fastify missing from OpenAPI: {local_missing}")
        if local_fictional:
            lines.append(f"OpenAPI missing from Fastify: {local_fictional}")
        if hosted_missing:
            lines.append(f"Hosted missing from OpenAPI: {hosted_missing}")
        if hosted_fictional:
            lines.append(f"OpenAPI missing from hosted: {hosted_fictional}")
        raise SystemExit("\n".join(lines))
    print(f"OpenAPI route parity: {len(router)} operations across Fastify and hosted adapters")


if __name__ == "__main__":
    main()
