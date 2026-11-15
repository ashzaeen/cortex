"""Validate responses against contracts/openapi.yaml (and the JSON Schemas it references)."""
import json
from functools import cache

import yaml
from jsonschema import Draft202012Validator, FormatChecker
from referencing import Registry, Resource
from referencing.jsonschema import DRAFT202012

from core.config import REPO_ROOT

BASE = "file:///contracts/"


@cache
def registry() -> Registry:
    spec = yaml.safe_load((REPO_ROOT / "contracts" / "openapi.yaml").read_text(encoding="utf-8"))
    resources = [(BASE + "openapi.yaml", Resource.from_contents(spec, default_specification=DRAFT202012))]
    for f in (REPO_ROOT / "contracts" / "schemas").glob("*.schema.json"):
        resources.append((BASE + "schemas/" + f.name,
                          Resource.from_contents(json.loads(f.read_text(encoding="utf-8")))))
    return Registry().with_resources(resources)


def _pointer(path: str, method: str, status: int) -> str:
    esc = path.replace("~", "~0").replace("/", "~1")
    return f"{BASE}openapi.yaml#/paths/{esc}/{method}/responses/{status}/content/application~1json/schema"


def validate(resp, path: str, method: str, status: int | None = None):
    """Assert the status code and that the JSON body matches the contract for that operation."""
    status = status or resp.status_code
    assert resp.status_code == status, f"{method.upper()} {path}: {resp.status_code} {resp.text}"
    schema = {"$ref": _pointer(path, method, status)}
    if status >= 400:
        schema = {"$ref": f"{BASE}openapi.yaml#/components/schemas/Error"}
    v = Draft202012Validator(schema, registry=registry(), format_checker=FormatChecker())
    errors = sorted(v.iter_errors(resp.json()), key=lambda e: list(e.path))
    assert not errors, f"{method.upper()} {path} violates the contract: " + "; ".join(
        f"{'/'.join(map(str, e.path))}: {e.message}" for e in errors[:5])
    return resp.json()


def validate_entity(obj: dict, schema_file: str):
    v = Draft202012Validator({"$ref": BASE + "schemas/" + schema_file}, registry=registry(),
                             format_checker=FormatChecker())
    errors = list(v.iter_errors(obj))
    assert not errors, f"{schema_file}: " + "; ".join(e.message for e in errors[:5])
