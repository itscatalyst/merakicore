import { useEffect, useMemo, useState } from "react";
import type { ProfileAtom, UpdateProposal } from "@meraki/contracts";

export type AtomOperation = "confirm" | "edit" | "rescope" | "limit" | "revoke" | "supersede" | "weaken" | "split";
export type RunTraceView = Readonly<{
  runId: string;
  changed: boolean;
  packHash: string;
  appliedAtomIds: string[];
  taskContextDigest: string;
  candidates: Array<{ atomId: string; version: number; decision: string; reasons: string[]; scores: Record<string, unknown> }>;
  provenance: Array<{ atomId: string; evidenceEventIds: string[] }>;
}>;
export type RunView = Readonly<{ run: { trace: RunTraceView }; context: { task_type: string; mode?: string }; recordedAt: string }>;
export type EvaluationView = Readonly<{ runId: string; effective: boolean; evaluation: { id: string; evaluator_class: "human_blind" | "objective" | "model_weak"; result: "win" | "loss" | "tie" | "abstain"; uncertainty: number; criteria: Record<string, unknown> }; attribution?: { target: { id: string; version: number }; effect: number } }>;
export type LearningTraceView = Readonly<{ source: { id: string; trust_class: string }; event: { id: string; event_type: string }; observation?: { id: string; description: string; epistemicClass: string }; signal?: { id: string; kind: string; support: number; confidence: number }; hypothesis?: { id: string; claim: string; confidence: number }; atom?: { id: string; lifecycle: string; version: number } }>;
export type CausalRunView = Readonly<{ output: string; trace: { runId: string; changed: boolean; appliedAtomIds: string[] } }>;
export type CausalReportView = Readonly<{ guidance: string; experimentId: string; arms: { baseline: { related: CausalRunView; unrelated: CausalRunView }; rawMemory: { related: CausalRunView; unrelated: CausalRunView }; merakiPack: { related: CausalRunView; unrelated: CausalRunView }; ablatedPack: { related: CausalRunView; unrelated: CausalRunView } }; objectiveRecords: { merakiRelated: { evaluation: { result: string } }; ablatedRelated: { evaluation: { result: string } } }; correctionBurden: { baseline: number; rawMemory: number; merakiPack: number; ablatedPack: number }; relatedImproves: boolean; unrelatedUnaffected: boolean; targetedAblationRemovesImprovement: boolean }>;

export const traceRows = (run?: RunView) => {
  if (!run) return { taskContextDigest: undefined, packHash: undefined, candidates: [], provenance: [] };
  return {
    taskContextDigest: run.run.trace.taskContextDigest,
    packHash: run.run.trace.packHash,
    candidates: run.run.trace.candidates,
    provenance: run.run.trace.provenance
  };
};

export const atomCommandPayload = (atom: ProfileAtom, operation: AtomOperation, claim?: string, claims?: string[], counterevidenceEventId?: string) => ({
  atom_id: atom.id,
  expected_version: atom.version,
  operation,
  ...(operation === "edit" ? { claim: claim?.trim() ?? "" } : {}),
  ...(operation === "split" ? { claims: claims?.map((item) => item.trim()).filter(Boolean) ?? [] } : {}),
  ...(operation === "weaken" ? { counterevidence_event_id: counterevidenceEventId?.trim() ?? "" } : {}),
  ...(operation === "rescope" ? { scope: atom.scope, mode: atom.mode } : {})
});
export const proposalCommandPayload = (operation: "approve" | "reject" | "rollback") => ({ operation });
export const atomTracePath = (atomId: string) => `/v1/profile/atoms/${atomId}/trace`;
export type CorrectionDraft = Readonly<{ tenantId: string; subjectId: string; taskType: string; scopeRef: string; mode: string; original: string; correction: string }>;
export const correctionRequestPayload = (draft: CorrectionDraft) => ({ tenantId: draft.tenantId.trim(), subjectId: draft.subjectId.trim(), actorId: draft.subjectId.trim(), runId: `studio-${Date.now()}`, taskType: draft.taskType.trim(), scope: { level: "project", ref: draft.scopeRef.trim() }, ...(draft.mode.trim() ? { mode: draft.mode.trim() } : {}), original: draft.original.trim(), correction: draft.correction.trim() });
export const correctionCandidatePayload = (eventId: string, draft: CorrectionDraft) => ({ event_id: eventId, claim: `For ${draft.taskType.trim()}, prefer: ${draft.correction.trim()}`, facet: "workflow" as const });
export const causalEvaluationPayload = (draft: CorrectionDraft) => {
  const runId = `studio-causal-${Date.now()}`;
  const context = { contract: "task_context" as const, tenant_id: draft.tenantId.trim(), subject_id: draft.subjectId.trim(), task_id: runId, task_type: draft.taskType.trim(), scope: { level: "project" as const, ref: draft.scopeRef.trim() }, ...(draft.mode.trim() ? { mode: draft.mode.trim() } : {}), constraints: [], permissions: [], token_budget: 1000 };
  return { experiment_id: runId, correction: correctionRequestPayload(draft), related: { context, request: "Studio related task", baseline: "BASELINE" }, unrelated: { context: { ...context, task_id: `${runId}-negative`, mode: "negative-control" }, request: "Studio unrelated task", baseline: "BASELINE" } };
};

const loadAtoms = async (): Promise<ProfileAtom[]> => {
  const response = await fetch("/v1/profile/atoms");
  if (!response.ok) throw new Error("PROFILE_READ_FAILED");
  return ((await response.json()) as { items?: ProfileAtom[] }).items ?? [];
};
const loadRuns = async (): Promise<RunView[]> => {
  const response = await fetch("/v1/runs");
  if (!response.ok) throw new Error("RUN_READ_FAILED");
  return ((await response.json()) as { items?: RunView[] }).items ?? [];
};
const loadUpdateProposals = async (): Promise<UpdateProposal[]> => {
  const response = await fetch("/v1/update-proposals");
  if (!response.ok) throw new Error("UPDATE_PROPOSAL_READ_FAILED");
  return ((await response.json()) as { items?: UpdateProposal[] }).items ?? [];
};
const loadEvaluations = async (): Promise<EvaluationView[]> => {
  const response = await fetch("/v1/evaluations");
  if (!response.ok) throw new Error("EVALUATION_READ_FAILED");
  return ((await response.json()) as { items?: EvaluationView[] }).items ?? [];
};
const loadLearningTrace = async (atomId: string): Promise<LearningTraceView> => {
  const response = await fetch(atomTracePath(atomId));
  if (!response.ok) throw new Error("LEARNING_TRACE_READ_FAILED");
  return (await response.json() as { trace: LearningTraceView }).trace;
};

const CausalEvaluationPanel = ({ report, onRun }: { report?: CausalReportView; onRun: () => void }) => <section className="evaluation-viewer"><h2>Connected causal proof</h2><div className="actions"><button onClick={onRun}>Run connected causal proof</button></div>{report && <><p className="mono">experiment {report.experimentId} · guidance: {report.guidance}</p><p>{report.relatedImproves ? "Related output improved." : "Related improvement not proven."} {report.unrelatedUnaffected ? "Unrelated control remained baseline." : "Unrelated control changed."} {report.targetedAblationRemovesImprovement ? "Targeted ablation removed the improvement." : "Targeted ablation did not remove the improvement."}</p><p>Correction burden: baseline {report.correctionBurden.baseline}, raw memory {report.correctionBurden.rawMemory}, Meraki Pack {report.correctionBurden.merakiPack}, ablated {report.correctionBurden.ablatedPack}.</p><ul><li>Meraki related run: <span className="mono">{report.arms.merakiPack.related.trace.runId}</span> ({report.objectiveRecords.merakiRelated.evaluation.result})</li><li>Raw-memory unrelated run: <span className="mono">{report.arms.rawMemory.unrelated.trace.runId}</span></li><li>Ablated related run: <span className="mono">{report.arms.ablatedPack.related.trace.runId}</span> ({report.objectiveRecords.ablatedRelated.evaluation.result})</li></ul></>}</section>;

export function App() {
  const [atoms, setAtoms] = useState<ProfileAtom[]>([]);
  const [selected, setSelected] = useState<string>();
  const [runs, setRuns] = useState<RunView[]>([]);
  const [updateProposals, setUpdateProposals] = useState<UpdateProposal[]>([]);
  const [evaluations, setEvaluations] = useState<EvaluationView[]>([]);
  const [causalReport, setCausalReport] = useState<CausalReportView>();
  const [learningTrace, setLearningTrace] = useState<LearningTraceView>();
  const [draftClaim, setDraftClaim] = useState("");
  const [correctionDraft, setCorrectionDraft] = useState<CorrectionDraft>({ tenantId: "", subjectId: "", taskType: "", scopeRef: "", mode: "", original: "", correction: "" });
  const [notice, setNotice] = useState("Loading canonical profile read model…");
  useEffect(() => {
    void Promise.all([loadAtoms(), loadRuns(), loadUpdateProposals(), loadEvaluations()]).then(([loaded, recordedRuns, proposals, recordedEvaluations]) => {
      setAtoms(loaded); setRuns(recordedRuns); setUpdateProposals(proposals); setEvaluations(recordedEvaluations); setSelected(loaded[0]?.id);
      setNotice(loaded.length ? "Connected canonical profile loaded." : "No live profile atoms available. Studio does not invent learning.");
    }).catch(() => setNotice("Profile API unavailable. Studio does not show fixture learning."));
  }, []);
  const atom = useMemo(() => atoms.find((item) => item.id === selected) ?? atoms[0], [atoms, selected]);
  useEffect(() => {
    if (!atom) { setLearningTrace(undefined); return; }
    void loadLearningTrace(atom.id).then(setLearningTrace).catch(() => setLearningTrace(undefined));
  }, [atom?.id]);
  const trace = traceRows(runs[0]);
  const command = async (operation: AtomOperation) => {
    if (!atom) return;
    const counterEvent = operation === "weaken" ? globalThis.prompt("Existing immutable counterevidence event ID", "") ?? "" : undefined;
    const splitClaims = operation === "split" ? (globalThis.prompt("Replacement claims separated by |", "") ?? "").split("|") : undefined;
    try {
      const response = await fetch(`/v1/profile/atoms/${atom.id}/commands`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(atomCommandPayload(atom, operation, operation === "edit" ? draftClaim || atom.claim : undefined, splitClaims, counterEvent)) });
      const result = await response.json() as { atom?: ProfileAtom; atoms?: ProfileAtom[]; error?: string };
      if (!response.ok) throw new Error(result.error ?? "COMMAND_FAILED");
      if (result.atoms) {
        setAtoms((current) => [...current.filter((item) => item.id !== atom.id), ...result.atoms!]);
        setSelected(result.atoms[0]?.id);
        setNotice(`split created ${result.atoms.length} governed candidate claims.`);
        return;
      }
      if (!result.atom) throw new Error("COMMAND_RESULT_REQUIRED");
      setAtoms((current) => current.map((item) => item.id === atom.id ? result.atom! : item));
      setNotice(`${operation} applied as canonical version ${result.atom.version}.`);
    } catch (error) { setNotice(`Command was not applied: ${error instanceof Error ? error.message : "COMMAND_FAILED"}`); }
  };
  const commandProposal = async (proposal: UpdateProposal, operation: "approve" | "reject" | "rollback") => {
    try {
      const response = await fetch(`/v1/update-proposals/${proposal.id}/commands`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(proposalCommandPayload(operation)) });
      const result = await response.json() as { proposal?: UpdateProposal; atom?: ProfileAtom; error?: string };
      if (!response.ok || !result.proposal) throw new Error(result.error ?? "UPDATE_PROPOSAL_COMMAND_FAILED");
      setUpdateProposals((current) => current.map((item) => item.id === proposal.id ? result.proposal! : item));
      if (result.atom) setAtoms((current) => current.map((item) => item.id === result.atom!.id ? result.atom! : item));
      setNotice(`Update proposal ${operation} recorded through the canonical engine.`);
    } catch (error) { setNotice(`Update proposal was not applied: ${error instanceof Error ? error.message : "UPDATE_PROPOSAL_COMMAND_FAILED"}`); }
  };
  const submitCorrection = async () => {
    const required = [correctionDraft.tenantId, correctionDraft.subjectId, correctionDraft.taskType, correctionDraft.scopeRef, correctionDraft.original, correctionDraft.correction];
    if (required.some((value) => !value.trim())) { setNotice("Correction was not submitted: tenant, subject, task, project, original, and correction are required."); return; }
    try {
      const correction = await fetch("/v1/corrections", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(correctionRequestPayload(correctionDraft)) });
      const recorded = await correction.json() as { evidence?: { eventId?: string; event?: { id: string } }; error?: string };
      const eventId = recorded.evidence?.eventId ?? recorded.evidence?.event?.id;
      if (!correction.ok || !eventId) throw new Error(recorded.error ?? "CORRECTION_RECORD_FAILED");
      const candidate = await fetch("/v1/learning/candidates", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(correctionCandidatePayload(eventId, correctionDraft)) });
      const result = await candidate.json() as { lesson?: ProfileAtom; error?: string };
      if (!candidate.ok || !result.lesson) throw new Error(result.error ?? "CANDIDATE_EXTRACTION_FAILED");
      setAtoms((current) => [...current.filter((item) => item.id !== result.lesson!.id), result.lesson!]);
      setSelected(result.lesson.id); setDraftClaim(result.lesson.claim);
      setNotice("Correction is immutable evidence. Its scoped learning candidate is pending your approval.");
    } catch (error) { setNotice(`Correction was not submitted: ${error instanceof Error ? error.message : "CORRECTION_SUBMIT_FAILED"}`); }
  };
  const runCausalEvaluation = async () => {
    const required = [correctionDraft.tenantId, correctionDraft.subjectId, correctionDraft.taskType, correctionDraft.scopeRef, correctionDraft.original, correctionDraft.correction];
    if (required.some((value) => !value.trim())) { setNotice("Causal proof requires the correction intake fields first."); return; }
    try {
      const response = await fetch("/v1/evaluations/causal", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(causalEvaluationPayload(correctionDraft)) });
      const result = await response.json() as { report?: CausalReportView; error?: string };
      if (!response.ok || !result.report) throw new Error(result.error ?? "CAUSAL_EVALUATION_FAILED");
      setCausalReport(result.report);
      setNotice("Connected causal proof completed: related improvement, negative control, and targeted ablation are visible below.");
    } catch (error) { setNotice(`Causal proof was not run: ${error instanceof Error ? error.message : "CAUSAL_EVALUATION_FAILED"}`); }
  };
  return <><main className="studio-shell">
    <header><p className="eyebrow">MERAKI STUDIO / LEARNING CONTROL</p><h1>Evidence, scope, and change</h1><p className="subtitle">A read model over canonical engine state. Studio submits governed commands; it never writes atoms directly.</p></header>
    <p className="notice" role="status">{notice}</p><section className="run-strip"><strong>{runs.length}</strong> recorded runs · {runs[0] ? `${runs[0].context.task_type} / ${runs[0].context.mode ?? "default"} / ${runs[0].run.trace.changed ? "guidance applied" : "baseline preserved"}` : "no connected activity yet"}</section><section className="correction-intake"><h2>Submit a correction</h2><p>Record explicit feedback as immutable evidence, then create a governed candidate. Nothing changes agent behavior until approval.</p><div className="grid"><label>Tenant ID<input value={correctionDraft.tenantId} onChange={(event) => setCorrectionDraft((draft) => ({ ...draft, tenantId: event.target.value }))} /></label><label>Subject ID<input value={correctionDraft.subjectId} onChange={(event) => setCorrectionDraft((draft) => ({ ...draft, subjectId: event.target.value }))} /></label><label>Task type<input value={correctionDraft.taskType} onChange={(event) => setCorrectionDraft((draft) => ({ ...draft, taskType: event.target.value }))} /></label><label>Project scope<input value={correctionDraft.scopeRef} onChange={(event) => setCorrectionDraft((draft) => ({ ...draft, scopeRef: event.target.value }))} /></label><label>Mode (optional)<input value={correctionDraft.mode} onChange={(event) => setCorrectionDraft((draft) => ({ ...draft, mode: event.target.value }))} /></label></div><label>Original<input value={correctionDraft.original} onChange={(event) => setCorrectionDraft((draft) => ({ ...draft, original: event.target.value }))} /></label><label>Correction<input value={correctionDraft.correction} onChange={(event) => setCorrectionDraft((draft) => ({ ...draft, correction: event.target.value }))} /></label><div className="actions"><button onClick={() => void submitCorrection()}>Record correction and propose learning</button></div></section>
    <div className="workspace"><aside><h2>Learning queue</h2>{atoms.map((item) => <button className={item.id === atom?.id ? "atom selected" : "atom"} key={item.id} onClick={() => setSelected(item.id)}><b>{item.claim}</b><small>{item.facet} · {item.lifecycle} · {Math.round(item.confidence * 100)}%</small></button>)}</aside>
      {atom && <article><div className="card-head"><span className={`pill ${atom.lifecycle}`}>{atom.lifecycle}</span><span>version {atom.version} · mode: {atom.mode ?? "all"}</span></div><h2>{atom.claim}</h2><div className="grid"><section><h3>Immutable evidence</h3><p className="mono">event {atom.evidence[0]?.event_id} · span {atom.evidence[0]?.span_start}–{atom.evidence[0]?.span_end}</p><p>{atom.epistemic_class} claim; source text appears only when the connected engine authorizes it.</p></section><section><h3>Governance</h3><p>Scope: {atom.scope.level}{atom.scope.ref ? ` / ${atom.scope.ref}` : ""}</p><p>Horizon: {atom.temporal_horizon} · sensitivity: {atom.sensitivity}</p><p>Counterevidence: {atom.counterevidence.length}</p></section></div><section className="live-learning"><h3>Live Learning</h3>{learningTrace ? <ol><li>source {learningTrace.source.trust_class}</li><li>event {learningTrace.event.event_type}</li><li>{learningTrace.observation ? `observation: ${learningTrace.observation.description}` : "observation pending"}</li><li>{learningTrace.signal ? `signal: ${learningTrace.signal.kind}` : "signal pending"}</li><li>{learningTrace.hypothesis ? `hypothesis: ${learningTrace.hypothesis.claim}` : "hypothesis pending"}</li><li>atom {learningTrace.atom?.lifecycle ?? "not created"}</li></ol> : <p>Canonical learning trace is unavailable for this atom.</p>}</section><label>Claim editor<input value={draftClaim || atom.claim} onChange={(event) => setDraftClaim(event.target.value)} aria-label="Learning claim" /></label><div className="actions"><button onClick={() => void command("confirm")}>Approve</button><button onClick={() => void command("edit")}>Save claim</button><button onClick={() => void command("rescope")}>Rescope</button><button onClick={() => void command("limit")}>Limit to task</button><button onClick={() => void command("weaken")}>Weaken</button><button onClick={() => void command("split")}>Split claim</button><button onClick={() => void command("supersede")}>Supersede</button><button className="danger" onClick={() => void command("revoke")}>Revoke</button></div></article>}
    </div><section className="proposal-viewer"><h2>Learning Queue: governed updates</h2>{updateProposals.length ? <ul>{updateProposals.map((proposal) => <li key={proposal.id}><p><span className={`pill ${proposal.status}`}>{proposal.status}</span> <span className="mono">{proposal.operation} {proposal.target.id}@{proposal.target.version}</span></p><p>{proposal.expected_impact}</p><p className="mono">evidence {proposal.evidence.map((item) => item.event_id).join(", ")}</p>{proposal.status === "pending" && <div className="actions"><button onClick={() => void commandProposal(proposal, "approve")}>Approve update</button><button className="danger" onClick={() => void commandProposal(proposal, "reject")}>Reject update</button></div>}{proposal.status === "applied" && <div className="actions"><button onClick={() => void commandProposal(proposal, "rollback")}>Rollback update</button></div>}</li>)}</ul> : <p>No attributed update proposal is pending. Studio does not infer one from model output.</p>}</section><section className="evaluation-viewer"><h2>Evaluation Lab: recorded verdicts</h2>{evaluations.length ? <ul>{evaluations.map((item) => <li key={item.evaluation.id}><span className={`pill ${item.effective ? "active" : "rejected"}`}>{item.effective ? "effective" : "superseded"}</span> <span className="mono">{item.evaluation.evaluator_class} / {item.evaluation.result} / uncertainty {item.evaluation.uncertainty}</span><p>{item.attribution ? `attribution ${item.attribution.target.id}@${item.attribution.target.version}: ${item.attribution.effect}` : "No atom attribution: this run used no profile guidance."}</p></li>)}</ul> : <p>No human-blind, objective, or model verdict has been recorded. Studio does not fabricate evaluation results.</p>}</section><section className="trace-viewer"><h2>Trace Viewer</h2>{runs[0] ? <><p className="mono">run {runs[0].run.trace.runId} · task {runs[0].context.task_type} / {runs[0].context.mode ?? "default"}</p><div className="grid"><section><h3>Pack compilation</h3><p className="mono">context {trace.taskContextDigest}</p><p className="mono">pack {trace.packHash}</p><p>{runs[0].run.trace.changed ? "Guidance changed the connected run." : "No guidance was applied; baseline behavior was preserved."}</p></section><section><h3>Provenance</h3>{trace.provenance.length ? <ul>{trace.provenance.map((item) => <li key={item.atomId}><span className="mono">{item.atomId}</span> ← {item.evidenceEventIds.join(", ") || "no authorized evidence id"}</li>)}</ul> : <p>No profile atom was applied to this run.</p>}</section></div><section><h3>Retrieved candidates and exclusions</h3>{trace.candidates.length ? <ul>{trace.candidates.map((candidate) => <li key={`${candidate.atomId}:${candidate.version}`}><span className={`decision ${candidate.decision}`}>{candidate.decision}</span> <span className="mono">{candidate.atomId}@{candidate.version}</span> — {candidate.reasons.join("; ") || "no reason recorded"}</li>)}</ul> : <p>No retrieval candidates were recorded.</p>}</section></> : <p>No connected run trace available. Studio does not fabricate activity.</p>}</section><style>{styles}</style>
  </main><CausalEvaluationPanel report={causalReport} onRun={() => void runCausalEvaluation()} /></>;
}

const styles = `:root{font-family:Inter,system-ui;color:#e9edf5;background:#10131a}body{margin:0}.studio-shell{max-width:1180px;margin:auto;padding:48px 32px}.eyebrow,.subtitle,.mono,small{color:#9ca7b9}.workspace,.grid{display:grid;gap:16px}.workspace{grid-template-columns:330px 1fr;margin-top:28px}.grid{grid-template-columns:1fr 1fr}aside,article,section,.trace-viewer,.proposal-viewer,.evaluation-viewer,.correction-intake{background:#171c25;border:1px solid #293241;border-radius:14px;padding:20px}.correction-intake,.trace-viewer,.proposal-viewer,.evaluation-viewer{margin-top:16px}.trace-viewer ul,.proposal-viewer ul,.evaluation-viewer ul{margin:0;padding-left:20px}.trace-viewer li,.proposal-viewer li,.evaluation-viewer li{margin:8px 0}.atom{display:block;text-align:left;width:100%;background:transparent;color:#dce3ee;border:0;border-top:1px solid #293241;padding:15px 2px}.atom b,.atom small{display:block}.selected b{color:#91a9ff}.card-head{display:flex;justify-content:space-between}.pill,.decision{padding:5px 9px;border-radius:999px;background:#3b2f17}.pill.active,.pill.applied,.decision.included{background:#17372d}.pill.revoked,.pill.rejected,.danger,.decision.excluded{background:#452026}.actions{display:flex;flex-wrap:wrap;gap:9px;margin-top:18px}button{cursor:pointer;border:0;border-radius:8px;padding:10px 13px}label,input{display:block;width:100%;margin-top:16px}input{padding:11px;background:#10131a;color:#e9edf5;border:1px solid #394556}.notice{color:#71e1ad}@media(max-width:800px){.workspace,.grid{grid-template-columns:1fr}}`;
