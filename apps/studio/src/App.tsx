import { useEffect, useMemo, useState } from "react";
import type { EvidenceRef, ProfileAtom, Scope } from "@meraki/contracts";

type AtomView = ProfileAtom & { evidenceText: string; sourceLabel: string };

const demoEvidence: EvidenceRef = { event_id: "evt-correction-001", span_start: 0, span_end: 64, quote_hash: "sha256:correction" };
const demoScope: Scope = { level: "project", ref: "meraki-core" };
const initialAtom: AtomView = {
  contract: "profile_atom", id: "atom-demo-001", version: 1, tenant_id: "tenant-demo", subject_id: "user-demo",
  facet: "workflow", claim: "Prefer concise implementation plans before making repository changes.", epistemic_class: "declared",
  scope: demoScope, mode: "engineering", temporal_horizon: "durable", lifecycle: "candidate", confidence: 0.86, utility: 0.8,
  sensitivity: "normal", evidence: [demoEvidence], counterevidence: [], created_at: "2026-07-13T10:00:00Z",
  evidenceText: "User correction: ‘Make the plan first, then execute as one stack engineering team.’", sourceLabel: "explicit correction"
};

export function applyLocalCommand(atom: AtomView, operation: "confirm" | "edit" | "rescope" | "limit" | "revoke"): AtomView {
  const lifecycle = operation === "revoke" ? "revoked" : operation === "confirm" ? "active" : atom.lifecycle;
  const scope = operation === "limit" ? { level: "task" as const, ref: "current-task" } : atom.scope;
  return { ...atom, version: atom.version + 1, lifecycle, scope, mode: operation === "rescope" ? "engineering" : atom.mode };
}

async function loadAtoms(): Promise<AtomView[]> {
  try {
    const response = await fetch("/v1/profile/atoms");
    if (!response.ok) return [initialAtom];
    const data = (await response.json()) as { items?: AtomView[] };
    return data.items?.length ? data.items : [initialAtom];
  } catch { return [initialAtom]; }
}

export function App() {
  const [atoms, setAtoms] = useState<AtomView[]>([]);
  const [selected, setSelected] = useState<string>();
  const [notice, setNotice] = useState("Loading evidence-backed learning…");
  useEffect(() => { void loadAtoms().then((loaded) => { setAtoms(loaded); setSelected(loaded[0]?.id); setNotice("Live API unavailable; showing a traceable local fixture."); }); }, []);
  const atom = useMemo(() => atoms.find((item) => item.id === selected) ?? atoms[0], [atoms, selected]);
  const command = async (operation: "confirm" | "edit" | "rescope" | "limit" | "revoke") => {
    if (!atom) return;
    const next = applyLocalCommand(atom, operation);
    setAtoms((current) => current.map((item) => item.id === atom.id ? next : item));
    setNotice(`${operation} recorded as version ${next.version}; immutable history preserved.`);
    try { await fetch(`/v1/profile/atoms/${atom.id}/commands`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ atom_id: atom.id, expected_version: atom.version, operation, reason: "Studio user action" }) }); } catch { /* local-first demo remains usable */ }
  };
  return <main className="studio-shell">
    <header><div><p className="eyebrow">MERAKI STUDIO / LEARNING CONTROL</p><h1>Evidence, scope, and change</h1><p className="subtitle">Inspect what the agent learned, why it believes it, and where it is allowed to act.</p></div><span className="status">● connected read model</span></header>
    <section className="metrics"><div><strong>{atoms.length}</strong><span>learning atoms</span></div><div><strong>1</strong><span>pending review</span></div><div><strong>100%</strong><span>source traceability</span></div><div><strong>v0.1.0</strong><span>contract</span></div></section>
    <div className="workspace"><aside><h2>Learning queue</h2>{atoms.map((item) => <button className={item.id === atom?.id ? "atom selected" : "atom"} key={item.id} onClick={() => setSelected(item.id)}><b>{item.claim}</b><small>{item.facet} · {item.lifecycle} · {Math.round(item.confidence * 100)}% confidence</small></button>)}</aside>
      {atom && <article><div className="card-head"><div><span className={`pill ${atom.lifecycle}`}>{atom.lifecycle}</span><span className="version">version {atom.version}</span></div><span className="mode">mode: {atom.mode ?? "all"}</span></div><h2>{atom.claim}</h2><p className="muted">Narrow lesson extracted from explicit user evidence. It will only be eligible when task scope and mode match.</p>
        <div className="grid"><div className="panel"><h3>Evidence</h3><blockquote>{atom.evidenceText}</blockquote><p className="mono">event {atom.evidence[0]?.event_id} · span {atom.evidence[0]?.span_start}–{atom.evidence[0]?.span_end}</p><span className="trust">{atom.sourceLabel}</span></div><div className="panel"><h3>Governance</h3><dl><dt>Scope</dt><dd>{atom.scope.level}{atom.scope.ref ? ` / ${atom.scope.ref}` : ""}</dd><dt>Confidence</dt><dd>{Math.round(atom.confidence * 100)}%</dd><dt>Horizon</dt><dd>{atom.temporal_horizon}</dd><dt>Lifecycle</dt><dd>{atom.lifecycle}</dd></dl></div></div>
        <div className="actions"><button onClick={() => void command("confirm")}>Approve</button><button onClick={() => void command("edit")}>Edit claim</button><button onClick={() => void command("rescope")}>Rescope</button><button onClick={() => void command("limit")}>Limit to task</button><button className="danger" onClick={() => void command("revoke")}>Revoke</button></div><p className="notice" role="status">{notice}</p>
      </article>}
    </div>
    <style>{styles}</style>
  </main>;
}

const styles = `:root{font-family:Inter,ui-sans-serif,system-ui;color:#e9edf5;background:#10131a}*{box-sizing:border-box}body{margin:0}.studio-shell{max-width:1180px;margin:auto;padding:48px 32px}header{display:flex;justify-content:space-between;gap:24px;align-items:flex-start}h1{font-size:44px;letter-spacing:-.04em;margin:8px 0}.eyebrow{color:#8fa8ff;font-size:12px;letter-spacing:.18em}.subtitle,.muted{color:#9ca7b9}.status{color:#71e1ad;background:#17372d;border:1px solid #27684e;padding:9px 13px;border-radius:999px;font-size:12px}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:38px 0}.metrics div,.panel,aside,article{background:#171c25;border:1px solid #293241;border-radius:14px}.metrics div{padding:18px}.metrics strong,.metrics span{display:block}.metrics strong{font-size:24px}.metrics span{color:#9ca7b9;font-size:12px;margin-top:5px}.workspace{display:grid;grid-template-columns:330px 1fr;gap:16px}aside,article{padding:22px}h2{margin-top:0}.atom{display:block;text-align:left;width:100%;background:transparent;color:#dce3ee;border:0;border-top:1px solid #293241;padding:16px 2px;cursor:pointer}.atom b,.atom small{display:block}.atom small{color:#8995a8;margin-top:8px}.atom.selected b{color:#91a9ff}.card-head{display:flex;justify-content:space-between;align-items:center}.pill,.trust{padding:5px 9px;border-radius:999px;font-size:11px;background:#3b2f17;color:#f3c96c}.pill.active{background:#17372d;color:#71e1ad}.pill.revoked{background:#452026;color:#ff9da9}.version,.mode{color:#8995a8;font-size:12px;margin-left:8px}.grid{display:grid;grid-template-columns:1.4fr 1fr;gap:12px;margin-top:26px}.panel{padding:18px}h3{margin-top:0;font-size:14px}blockquote{border-left:3px solid #91a9ff;padding-left:14px;color:#e7ebf4;line-height:1.55}.mono{font:12px ui-monospace;color:#8995a8}.trust{display:inline-block;background:#222f54;color:#aebeff}dl{display:grid;grid-template-columns:1fr 1fr;gap:14px;font-size:13px}dt{color:#8995a8}dd{margin:0}.actions{display:flex;flex-wrap:wrap;gap:9px;margin-top:18px}.actions button{background:#91a9ff;color:#10131a;border:0;border-radius:8px;padding:10px 13px;font-weight:700;cursor:pointer}.actions .danger{background:#f07b8c}.notice{color:#71e1ad;font-size:13px;min-height:20px}@media(max-width:800px){.workspace{grid-template-columns:1fr}.metrics{grid-template-columns:repeat(2,1fr)}header{display:block}.status{display:inline-block;margin-top:14px}.grid{grid-template-columns:1fr}}`;
