"""Validate schema coverage, fixtures, and generated-type drift."""
import json
from jsonschema import Draft202012Validator, FormatChecker
from generate import ROOT, SCHEMA, OUTPUT, render

EXPECTED = {"AuthContext","SourceRecord","Artifact","Event","Observation","Signal","Hypothesis","Episode","ProfileAtom","ProfileEdge","ProfileSnapshot","TaskContext","RetrievalCandidate","MerakiPack","Agent","AgentControlCommand","Run","Feedback","Outcome","Evaluation","Attribution","UpdateProposal","Goal","Experiment","ExperimentArm","Job","DeletionPreview","DeletionRequest","ExportRequest","ExportManifest","GraphPage","ApiError","IdempotencyReceipt","AtomCommand","ProposalCommand","RunTrace"}
schema = json.loads(SCHEMA.read_text(encoding="utf-8"))
Draft202012Validator.check_schema(schema)
refs = [item["$ref"].split("/")[-1] for item in schema["oneOf"]]
if len(refs) != len(set(refs)) or set(refs) != EXPECTED:
    raise SystemExit(f"contract coverage mismatch: expected={sorted(EXPECTED)} actual={sorted(refs)}")
validator = Draft202012Validator(schema, format_checker=FormatChecker())
valid = json.loads((ROOT / "schemas/fixtures/event.valid.json").read_text(encoding="utf-8"))
invalid = json.loads((ROOT / "schemas/fixtures/event.invalid.json").read_text(encoding="utf-8"))
validator.validate(valid)
if not list(validator.iter_errors(invalid)): raise SystemExit("negative fixture unexpectedly validated")
if not OUTPUT.exists() or OUTPUT.read_text(encoding="utf-8") != render():
    raise SystemExit("generated TypeScript drift; run pnpm contracts:generate")
print(f"contracts valid: {len(refs)} public definitions, fixtures pass, generated types match")
