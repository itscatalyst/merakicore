export type StudioRenderOptions = Readonly<{
  nonce?: string;
}>;

const studioHtml = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Meraki Studio</title>
<style>
:root{color-scheme:dark;--bg:#09111f;--panel:#111d30;--panel-soft:#0c1727;--line:#2b405f;--text:#edf4ff;--muted:#a9bad3;--accent:#5eead4;--purple:#a78bfa;--bad:#fb7185;--good:#86efac;--warning:#fbbf24}
*{box-sizing:border-box}
body{margin:0;background:radial-gradient(circle at 85% 0,#172554 0,transparent 35%),var(--bg);color:var(--text);font:14px/1.5 system-ui,sans-serif}
button,input{font:inherit}
button{min-height:44px;cursor:pointer;border:0;border-radius:8px;background:var(--accent);color:#04201c;font-weight:750;padding:10px 14px}
button:hover:not(:disabled){filter:brightness(1.08)}
button:disabled{cursor:wait;opacity:.62}
button.secondary{background:#263752;color:var(--text)}
button:focus-visible,input:focus-visible,summary:focus-visible,.scroll:focus-visible{outline:3px solid var(--purple);outline-offset:3px}
main{max-width:1240px;margin:auto;padding:28px}
header{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;margin-bottom:20px}
h1{margin:0;font-size:clamp(25px,4vw,32px);letter-spacing:-.02em}
h1 span{color:var(--accent)}
h2{font-size:17px;margin:0}
h3{font-size:14px;margin:20px 0 8px;color:var(--muted)}
p{margin:0}
.eyebrow{color:var(--muted);margin-top:3px}
.auth{display:grid;grid-template-columns:minmax(220px,320px) auto auto auto;gap:8px;align-items:end}
.field{display:grid;gap:5px}
.field label{font-weight:700}
.field small{color:var(--muted)}
input{width:100%;min-height:44px;background:#08101d;border:1px solid var(--line);border-radius:8px;color:var(--text);padding:10px 12px}
.status{min-height:26px;color:var(--muted);margin:0 0 12px}
.status.error{color:var(--bad)}
.status.success{color:var(--good)}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:14px;margin:0}
.card,.panel{background:color-mix(in srgb,var(--panel) 94%,transparent);border:1px solid var(--line);border-radius:12px;box-shadow:0 14px 35px #0003}
.card{padding:16px}
.card dt{color:var(--muted)}
.card dd{margin:2px 0 0;font-size:30px;font-weight:750;line-height:1.2}
.card small{display:block;color:var(--muted);margin-top:4px}
.panels{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:14px}
.panel{padding:18px;min-width:0}
.panel.wide{grid-column:1/-1}
.panel-heading{display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap;margin-bottom:12px}
.section-meta,.muted,th{color:var(--muted)}
.bar-row{display:grid;grid-template-columns:minmax(90px,1fr) minmax(110px,2fr) minmax(90px,auto);gap:10px;align-items:center;margin:10px 0}
.track{height:10px;background:#263752;border-radius:10px;overflow:hidden}
progress{width:100%;height:10px;display:block;accent-color:var(--accent)}
.bar-value{text-align:right;font-variant-numeric:tabular-nums}
.scroll{max-width:100%;overflow:auto;border-radius:8px}
table{border-collapse:collapse;width:100%;min-width:760px}
caption{padding:0;text-align:left;color:var(--muted)}
th,td{text-align:left;padding:10px 8px;border-bottom:1px solid var(--line);vertical-align:top}
tbody tr:last-child td{border-bottom:0}
.claim{max-width:470px;overflow-wrap:anywhere}
.mono{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12px;overflow-wrap:anywhere}
.pill{display:inline-block;border:1px solid var(--line);border-radius:99px;padding:2px 8px;color:var(--accent);white-space:nowrap}
.pill.good{color:var(--good)}
.pill.warning{color:var(--warning)}
.empty{padding:25px;text-align:center;color:var(--muted);background:var(--panel-soft);border-radius:8px}
.details{margin-top:8px}
summary{cursor:pointer;color:var(--accent);font-weight:650}
.detail-grid{display:grid;grid-template-columns:max-content minmax(0,1fr);gap:6px 12px;margin:10px 0 0}
.detail-grid dt{color:var(--muted)}
.detail-grid dd{margin:0;overflow-wrap:anywhere;white-space:pre-wrap}
.actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.lineage{margin-top:14px;padding:14px;background:var(--panel-soft);border:1px solid var(--line);border-radius:8px}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
@media(max-width:900px){
  main{padding:18px}
  header{flex-direction:column}
  .auth{width:100%;grid-template-columns:1fr 1fr}
  .field{grid-column:1/-1}
  .panels{grid-template-columns:1fr}
  .panel.wide{grid-column:auto}
}
@media(max-width:520px){
  main{padding:14px}
  .grid{grid-template-columns:1fr 1fr;gap:10px}
  .card,.panel{padding:14px}
  .card dd{font-size:25px}
  .bar-row{grid-template-columns:1fr minmax(85px,1.6fr)}
  .bar-value{grid-column:1/-1;text-align:left}
  .auth{grid-template-columns:1fr}
  .field{grid-column:auto}
}
</style>
</head>
<body>
<main>
  <header>
    <div>
      <h1>Meraki <span>Studio</span></h1>
      <p class="eyebrow">Inspect what the hosted learning runtime recorded, proposed, and applied.</p>
    </div>
    <div class="auth" aria-label="Dashboard connection">
      <div class="field">
        <label for="token">Bearer token</label>
        <input id="token" type="password" autocomplete="off" spellcheck="false" aria-describedby="token-help" required>
        <small id="token-help">Used only for requests from this page.</small>
      </div>
      <button id="connect" type="button">Connect</button>
      <button id="refresh" type="button" class="secondary" disabled>Refresh</button>
      <button id="forget" type="button" class="secondary">Forget token</button>
    </div>
  </header>
  <p id="message" class="status" role="status" aria-live="polite" aria-atomic="true">Enter a hosted bearer token to inspect its tenant and subject.</p>
  <section id="dashboard" aria-label="Meraki activity snapshot" aria-busy="false">
    <dl class="grid" id="metrics">
      <div class="card"><dt>Runs recorded</dt><dd>—</dd><small>Connect to load</small></div>
      <div class="card"><dt>Profile atoms</dt><dd>—</dd><small>Connect to load</small></div>
      <div class="card"><dt>Candidate approvals</dt><dd>—</dd><small>Connect to load</small></div>
      <div class="card"><dt>Pending updates</dt><dd>—</dd><small>Connect to load</small></div>
      <div class="card"><dt>Evaluations</dt><dd>—</dd><small>Connect to load</small></div>
    </dl>
    <section class="panels">
      <article class="panel" aria-labelledby="evaluation-heading">
        <div class="panel-heading"><h2 id="evaluation-heading">Evaluation results</h2><span class="section-meta" id="evaluation-meta">Not loaded</span></div>
        <div id="evaluations" class="empty">Connect to inspect evaluation outcomes.</div>
      </article>
      <article class="panel" aria-labelledby="state-heading">
        <div class="panel-heading"><h2 id="state-heading">Knowledge lifecycle</h2><span class="section-meta" id="state-meta">Not loaded</span></div>
        <div id="states" class="empty">Connect to inspect candidate and active knowledge.</div>
      </article>
      <article class="panel wide" aria-labelledby="atom-heading">
        <div class="panel-heading"><h2 id="atom-heading">Profile atoms</h2><span class="section-meta" id="atom-meta">Not loaded</span></div>
        <div class="scroll" id="atoms" tabindex="0" aria-label="Profile atoms table"><div class="empty">Connect to inspect learned claims and their scope.</div></div>
        <div id="trace" class="lineage empty" aria-live="polite">Select “View lineage” on an atom to inspect its evidence-to-guidance chain.</div>
      </article>
      <article class="panel wide" aria-labelledby="evidence-heading">
        <div class="panel-heading"><h2 id="evidence-heading">Evidence and provenance</h2><span class="section-meta" id="evidence-meta">Not loaded</span></div>
        <div class="scroll" id="evidence" tabindex="0" aria-label="Evidence and provenance table"><div class="empty">Connect to inspect bounded evidence metadata.</div></div>
      </article>
      <article class="panel wide" aria-labelledby="proposal-heading">
        <div class="panel-heading"><h2 id="proposal-heading">Update proposals</h2><span class="section-meta" id="proposal-meta">Not loaded</span></div>
        <div class="scroll" id="proposals" tabindex="0" aria-label="Update proposals table"><div class="empty">Connect to inspect governed update proposals.</div></div>
      </article>
      <article class="panel wide" aria-labelledby="run-heading">
        <div class="panel-heading"><h2 id="run-heading">Recent runs</h2><span class="section-meta" id="run-meta">Not loaded</span></div>
        <div class="scroll" id="runs" tabindex="0" aria-label="Recent runs table"><div class="empty">Connect to inspect how guidance affected agent output.</div></div>
      </article>
    </section>
  </section>
</main>
<script>
const q=(selector)=>document.querySelector(selector);
const esc=(value)=>String(value??'—').replace(/[&<>"']/g,(character)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const RUN_LIMIT=20;
const ATOM_LIMIT=100;
const SNAPSHOT_LIMIT=100;
let model={snapshot:null,atoms:[],runs:[],runTotal:0,runSummary:{},proposals:[],evaluations:[],evidence:[]};
let connected=false;

async function api(path,options={}){
  const token=q('#token').value.trim();
  const response=await fetch('/v1/'+path,{
    ...options,
    headers:{'content-type':'application/json',authorization:'Bearer '+token,...options.headers}
  });
  const body=await response.json().catch(()=>({}));
  if(!response.ok){
    const detail=body&&typeof body.error==='object'?body.error:{};
    const message=detail.message||body.error||('HTTP '+response.status);
    const error=new Error(String(message));
    error.code=detail.code||'HTTP_ERROR';
    error.requestId=detail.requestId||response.headers.get('x-request-id')||'';
    error.status=response.status;
    throw error;
  }
  return body;
}

const plural=(count,singular,pluralForm=singular+'s')=>count+' '+(count===1?singular:pluralForm);
const percentage=(count,total)=>total===0?0:Math.round(count/total*100);
const countBy=(items,key)=>Object.entries(items.reduce((counts,item)=>{
  const value=item?.[key]||'unknown';
  counts[value]=(counts[value]||0)+1;
  return counts;
},{})).sort((left,right)=>right[1]-left[1]||String(left[0]).localeCompare(String(right[0])));
const dateValue=(value)=>{
  const parsed=Date.parse(value);
  return Number.isFinite(parsed)?parsed:0;
};
const formatTime=(value)=>{
  const parsed=dateValue(value);
  return parsed?new Date(parsed).toLocaleString():'Unknown time';
};
const scopeLabel=(scope)=>{
  if(!scope)return 'Unknown scope';
  return scope.ref?scope.level+' · '+scope.ref:scope.level;
};
const confidenceLabel=(value)=>Number.isFinite(Number(value))?Math.round(Number(value)*100)+'%':'—';
const shortId=(value)=>{
  const text=String(value??'—');
  return text.length>14?text.slice(0,8)+'…'+text.slice(-4):text;
};
const preview=(value,limit=220)=>{
  const text=String(value??'—');
  return text.length>limit?text.slice(0,limit).trimEnd()+'…':text;
};
const newestRuns=(runs)=>runs.slice(0,RUN_LIMIT);

function bars(entries,total,label){
  if(!entries.length)return '<div class="empty">No '+esc(label.toLowerCase())+' recorded yet.</div>';
  return '<div role="list" aria-label="'+esc(label)+'; bars show share of total">'+entries.map(([name,count])=>{
    const share=percentage(count,total);
    return '<div class="bar-row" role="listitem"><span>'+esc(name)+'</span><div class="track"><progress max="100" value="'+share+'" aria-label="'+esc(name)+' '+share+' percent"></progress></div><strong class="bar-value">'+count+' · '+share+'%</strong></div>';
  }).join('')+'</div>';
}

function metrics(atoms,runs,runTotal,runSummary,proposals,evaluations){
  const candidates=atoms.filter((atom)=>atom.lifecycle==='candidate').length;
  const pendingUpdates=proposals.filter((proposal)=>proposal.status==='pending').length;
  const changed=Number.isFinite(Number(runSummary.guidance_applied))?Number(runSummary.guidance_applied):runs.filter((record)=>record.run?.trace?.changed===true).length;
  const preserved=Number.isFinite(Number(runSummary.baseline_preserved))?Number(runSummary.baseline_preserved):Math.max(0,runTotal-changed);
  const effective=evaluations.filter((record)=>record.effective===true).length;
  const synthetic=evaluations.filter((record)=>String(record.evaluation?.reason||'').startsWith('synthetic:')).length;
  const entries=[
    ['Runs recorded',runTotal,plural(changed,'guidance-applied run')+' · '+plural(preserved,'baseline-preserved run')],
    ['Profile atoms',atoms.length,plural(candidates,'candidate')],
    ['Candidate approvals',candidates,candidates?'Awaiting an explicit decision':'Nothing awaiting approval'],
    ['Pending updates',pendingUpdates,pendingUpdates?'Governed update proposals':'No pending proposals'],
    ['Evaluations',evaluations.length,plural(effective,'effective evaluation')+(synthetic?' · '+plural(synthetic,'synthetic record'):'')]
  ];
  q('#metrics').innerHTML=entries.map(([name,count,note])=>'<div class="card"><dt>'+esc(name)+'</dt><dd>'+count+'</dd><small>'+esc(note)+'</small></div>').join('');
}

function renderEvaluations(evaluations){
  const synthetic=evaluations.filter((record)=>String(record.evaluation?.reason||'').startsWith('synthetic:')).length;
  q('#evaluation-meta').textContent=plural(evaluations.length,'evaluation')+(synthetic?' · '+plural(synthetic,'synthetic'):'');
  const outcomeEntries=countBy(evaluations.map((record)=>record.evaluation||{}),'result');
  const latest=evaluations.slice(0,8);
  const detail=latest.length?'<h3>Newest evaluation records</h3><div class="scroll" tabindex="0" aria-label="Newest evaluation records"><table><thead><tr><th>Result</th><th>Evaluator</th><th>Uncertainty</th><th>Applied effect</th><th>Reason</th></tr></thead><tbody>'+latest.map((record)=>{
    const evaluation=record.evaluation||{};
    return '<tr><td><span class="pill">'+esc(evaluation.result)+'</span></td><td>'+esc(evaluation.evaluator_class)+'</td><td>'+confidenceLabel(evaluation.uncertainty)+'</td><td>'+esc(record.effective?'Effective':'Not effective')+'</td><td class="claim">'+esc(evaluation.reason||'No reason recorded')+'</td></tr>';
  }).join('')+'</tbody></table></div>':'';
  q('#evaluations').className='';
  q('#evaluations').innerHTML=bars(outcomeEntries,evaluations.length,'Evaluation result distribution')+detail;
}

function renderStates(atoms,proposals){
  q('#state-meta').textContent=plural(atoms.length,'current atom');
  const lifecycleEntries=countBy(atoms,'lifecycle');
  const pending=proposals.filter((proposal)=>proposal.status==='pending').length;
  q('#states').className='';
  q('#states').innerHTML=bars(lifecycleEntries,atoms.length,'Profile lifecycle distribution')+'<p class="section-meta">'+plural(pending,'pending update proposal')+'. Candidate approvals appear in the atom table below.</p>';
}

function renderEvidence(evidence){
  q('#evidence-meta').textContent=plural(evidence.length,'evidence event');
  if(!evidence.length){
    q('#evidence').innerHTML='<div class="empty">No evidence metadata is available for this subject.</div>';
    return;
  }
  q('#evidence').innerHTML='<table><caption class="sr-only">Bounded evidence metadata and provenance</caption><thead><tr><th>Recorded</th><th>Event</th><th>Source</th><th>Trust</th><th>Evidence spans</th></tr></thead><tbody>'+evidence.map((item)=>'<tr><td><time datetime="'+esc(item.recordedAt)+'">'+esc(formatTime(item.recordedAt))+'</time></td><td>'+esc(item.eventType)+'<div class="mono">'+esc(shortId(item.eventId))+'</div></td><td>'+esc(item.sourceType)+'<div class="mono">'+esc(shortId(item.sourceId))+'</div></td><td><span class="pill">'+esc(item.trustClass)+'</span></td><td>'+plural(Array.isArray(item.evidenceSpans)?item.evidenceSpans.length:0,'span')+'</td></tr>').join('')+'</tbody></table>';
}

function proposalDetails(proposal){
  return '<details class="details"><summary>Inspect proposal</summary><dl class="detail-grid"><dt>Target</dt><dd class="mono">'+esc(shortId(proposal.target?.id))+' v'+esc(proposal.target?.version)+'</dd><dt>Evidence</dt><dd class="mono">'+esc((proposal.evidence||[]).map((item)=>shortId(item.event_id)).join(', ')||'None')+'</dd><dt>Expected impact</dt><dd>'+esc(proposal.expected_impact||'Not recorded')+'</dd><dt>Scope</dt><dd>'+esc(scopeLabel(proposal.proposed_scope))+'</dd></dl></details>';
}

function renderProposals(proposals){
  q('#proposal-meta').textContent=plural(proposals.length,'proposal')+' · '+plural(proposals.filter((proposal)=>proposal.status==='pending').length,'pending');
  if(!proposals.length){
    q('#proposals').innerHTML='<div class="empty">No governed update proposals are recorded.</div>';
    return;
  }
  q('#proposals').innerHTML='<table><caption class="sr-only">Governed update proposals and decisions</caption><thead><tr><th>Status</th><th>Operation</th><th>Target</th><th>Details</th><th>Decision</th></tr></thead><tbody>'+proposals.map((proposal)=>{
    const action=proposal.status==='pending'
      ? '<button type="button" data-proposal-action="approve" data-proposal-id="'+esc(proposal.id)+'">Approve</button><button type="button" class="secondary" data-proposal-action="reject" data-proposal-id="'+esc(proposal.id)+'">Reject</button>'
      : proposal.status==='applied'
        ? '<button type="button" class="secondary" data-proposal-action="rollback" data-proposal-id="'+esc(proposal.id)+'">Rollback</button>'
        : '<span class="muted">No action</span>';
    return '<tr><td><span class="pill '+(proposal.status==='pending'?'warning':proposal.status==='applied'?'good':'')+'">'+esc(proposal.status)+'</span></td><td>'+esc(proposal.operation)+'</td><td class="mono">'+esc(shortId(proposal.target?.id))+' v'+esc(proposal.target?.version)+'</td><td>'+proposalDetails(proposal)+'</td><td><div class="actions">'+action+'</div></td></tr>';
  }).join('')+'</tbody></table>';
}

function atomRows(atoms){
  return atoms.map((atom)=>{
    const details={id:atom.id,version:atom.version,claim:atom.claim,lifecycle:atom.lifecycle,scope:scopeLabel(atom.scope),mode:atom.mode||'',evidence:(atom.evidence||[]).map((item)=>shortId(item.event_id)).join(', ')||'None'};
    const decision=atom.lifecycle==='candidate'
      ? '<button type="button" data-atom-action="confirm" data-id="'+esc(details.id)+'" data-version="'+esc(details.version)+'" data-claim="'+esc(details.claim)+'" data-lifecycle="'+esc(details.lifecycle)+'" data-scope="'+esc(details.scope)+'" data-mode="'+esc(details.mode)+'" data-evidence="'+esc(details.evidence)+'" aria-label="Approve candidate: '+esc(atom.claim)+'">Approve</button><button type="button" class="secondary" data-atom-action="revoke" data-id="'+esc(details.id)+'" data-version="'+esc(details.version)+'" data-claim="'+esc(details.claim)+'" data-lifecycle="'+esc(details.lifecycle)+'" data-scope="'+esc(details.scope)+'" data-mode="'+esc(details.mode)+'" data-evidence="'+esc(details.evidence)+'">Reject</button>'
      : '';
    const scopeAction=atom.lifecycle==='candidate'||atom.lifecycle==='active'||atom.lifecycle==='stable'||atom.lifecycle==='locked_core'
      ? '<button type="button" class="secondary" data-atom-action="rescope" data-id="'+esc(details.id)+'" data-version="'+esc(details.version)+'" data-claim="'+esc(details.claim)+'" data-lifecycle="'+esc(details.lifecycle)+'" data-scope="'+esc(details.scope)+'" data-mode="'+esc(details.mode)+'" data-evidence="'+esc(details.evidence)+'">Rescope</button>'
      : '';
    const revoke=atom.lifecycle==='active'||atom.lifecycle==='stable'||atom.lifecycle==='locked_core'
      ? '<button type="button" class="secondary" data-atom-action="revoke" data-id="'+esc(details.id)+'" data-version="'+esc(details.version)+'" data-claim="'+esc(details.claim)+'" data-lifecycle="'+esc(details.lifecycle)+'" data-scope="'+esc(details.scope)+'" data-mode="'+esc(details.mode)+'" data-evidence="'+esc(details.evidence)+'">Revoke</button>'
      : '';
    const actions='<div class="actions"><button type="button" class="secondary" data-trace="'+esc(atom.id)+'">View lineage</button>'+decision+scopeAction+revoke+'</div>';
    return '<tr><td class="claim">'+esc(atom.claim)+'</td><td>'+esc(atom.facet)+'</td><td>'+esc(scopeLabel(atom.scope))+(atom.mode?'<div class="muted">Mode: '+esc(atom.mode)+'</div>':'')+'</td><td><span class="pill '+(atom.lifecycle==='active'?'good':atom.lifecycle==='candidate'?'warning':'')+'">'+esc(atom.lifecycle)+'</span></td><td>'+confidenceLabel(atom.confidence)+'</td><td>'+actions+'</td></tr>';
  }).join('');
}

function renderAtoms(atoms){
  const ordered=atoms.slice().sort((left,right)=>{
    const lifecycleOrder=Number(right.lifecycle==='candidate')-Number(left.lifecycle==='candidate');
    return lifecycleOrder||dateValue(right.created_at)-dateValue(left.created_at);
  });
  const visible=ordered.slice(0,ATOM_LIMIT);
  q('#atom-meta').textContent=atoms.length>ATOM_LIMIT?'Showing '+visible.length+' of '+atoms.length+'; candidates first':'Showing all '+atoms.length;
  if(!atoms.length){
    q('#atoms').innerHTML='<div class="empty">No profile atoms exist for this subject. Record a correction and extract a candidate to start learning.</div>';
    q('#trace').className='lineage empty';
    q('#trace').textContent='No atom lineage is available.';
    return;
  }
  q('#atoms').innerHTML='<table><caption class="sr-only">Learned profile atoms, scopes, lifecycle states, and approval actions</caption><thead><tr><th>Learned claim</th><th>Facet</th><th>Scope</th><th>Lifecycle</th><th>Confidence</th><th>Decision</th></tr></thead><tbody>'+atomRows(visible)+'</tbody></table>';
  q('#trace').className='lineage empty';
  q('#trace').textContent='Select “View lineage” on an atom to inspect its evidence-to-guidance chain.';
}

function candidateTrace(record){
  const candidates=record.run?.trace?.candidates||[];
  if(!candidates.length)return 'No profile atoms were considered.';
  return candidates.map((candidate)=>{
    const reasons=(candidate.reasons||[]).join('; ')||'No reason recorded';
    return esc(shortId(candidate.atomId))+' v'+esc(candidate.version)+' — '+esc(candidate.decision)+': '+esc(reasons);
  }).join('<br>');
}

function renderRuns(runs,total){
  const visible=newestRuns(runs);
  q('#run-meta').textContent=total>visible.length?'Showing newest '+visible.length+' of '+total:'Showing all '+total+', newest first';
  if(!runs.length){
    q('#runs').innerHTML='<div class="empty">No agent runs exist for this subject. Run a related and unrelated task to verify guidance scope.</div>';
    return;
  }
  q('#runs').innerHTML='<table><caption class="sr-only">Newest agent runs and how Meraki guidance affected them</caption><thead><tr><th>Recorded</th><th>Task and scope</th><th>Guidance</th><th>Result</th><th>Output</th><th>Trace</th></tr></thead><tbody>'+visible.map((record)=>{
    const run=record.run||{};
    const trace=run.trace||{};
    const applied=trace.appliedAtomIds||[];
    const changed=trace.changed===true;
    const recorded=formatTime(record.recordedAt);
    return '<tr><td><time datetime="'+esc(record.recordedAt)+'">'+esc(recorded)+'</time><div class="mono" title="'+esc(trace.runId)+'">'+esc(shortId(trace.runId))+'</div></td><td>'+esc(record.context?.task_type)+'<div class="muted">'+esc(scopeLabel(record.context?.scope))+(record.context?.mode?' · '+esc(record.context.mode):'')+'</div></td><td>'+plural(applied.length,'atom')+'</td><td><span class="pill '+(changed?'good':'')+'">'+(changed?'Guidance applied':'Baseline unchanged')+'</span></td><td class="claim">'+esc(preview(run.output??run.baseline))+'</td><td><details class="details"><summary>Explain this run</summary><dl class="detail-grid"><dt>Request</dt><dd>'+esc(record.request)+'</dd><dt>Baseline</dt><dd>'+esc(run.baseline)+'</dd><dt>Final output</dt><dd>'+esc(run.output)+'</dd><dt>Pack hash</dt><dd class="mono">'+esc(trace.packHash)+'</dd><dt>Applied atoms</dt><dd class="mono">'+esc(applied.length?applied.join(', '):'None')+'</dd><dt>Candidate decisions</dt><dd>'+candidateTrace(record)+'</dd></dl></details></td></tr>';
  }).join('')+'</tbody></table>';
}

function render(){
  const atoms=model.atoms;
  const runs=model.runs;
  const runTotal=model.runTotal;
  const runSummary=model.runSummary;
  const proposals=model.proposals;
  const evaluations=model.evaluations;
  metrics(atoms,runs,runTotal,runSummary,proposals,evaluations);
  renderEvaluations(evaluations);
  renderStates(atoms,proposals);
  renderAtoms(atoms);
  renderRuns(runs,runTotal);
  renderEvidence(model.evidence);
  renderProposals(proposals);
}

function renderLearningTrace(trace){
  const source=trace.source||{};
  const event=trace.event||{};
  const observation=trace.observation||{};
  const signal=trace.signal||{};
  const hypothesis=trace.hypothesis||{};
  const atom=trace.atom||{};
  q('#trace').className='lineage';
  q('#trace').innerHTML='<div class="panel-heading"><h3>Selected learning lineage</h3><span class="pill">'+esc(atom.lifecycle||'evidence only')+'</span></div><dl class="detail-grid"><dt>Source trust</dt><dd>'+esc(source.trust_class)+'</dd><dt>Event</dt><dd>'+esc(event.event_type)+' · <span class="mono">'+esc(event.id)+'</span></dd><dt>Observation</dt><dd>'+esc(observation.description||'Not extracted')+'</dd><dt>Signal</dt><dd>'+esc(signal.kind||'Not created')+(signal.confidence===undefined?'':' · '+confidenceLabel(signal.confidence))+'</dd><dt>Hypothesis</dt><dd>'+esc(hypothesis.claim||'Not proposed')+'</dd><dt>Current atom</dt><dd>'+esc(atom.claim||'No governed atom')+'</dd></dl>';
}

function clearSnapshot(message){
  model={snapshot:null,atoms:[],runs:[],runTotal:0,runSummary:{},proposals:[],evaluations:[],evidence:[]};
  q('#metrics').innerHTML=['Runs recorded','Profile atoms','Candidate approvals','Pending updates','Evaluations'].map((name)=>'<div class="card"><dt>'+name+'</dt><dd>—</dd><small>'+esc(message)+'</small></div>').join('');
  q('#evaluation-meta').textContent='Not loaded';
  q('#state-meta').textContent='Not loaded';
  q('#atom-meta').textContent='Not loaded';
  q('#run-meta').textContent='Not loaded';
  q('#evidence-meta').textContent='Not loaded';
  q('#proposal-meta').textContent='Not loaded';
  q('#evaluations').className='empty';
  q('#states').className='empty';
  q('#evaluations').textContent=message;
  q('#states').textContent=message;
  q('#atoms').innerHTML='<div class="empty">'+esc(message)+'</div>';
  q('#trace').className='lineage empty';
  q('#trace').textContent=message;
  q('#runs').innerHTML='<div class="empty">'+esc(message)+'</div>';
  q('#evidence').innerHTML='<div class="empty">'+esc(message)+'</div>';
  q('#proposals').innerHTML='<div class="empty">'+esc(message)+'</div>';
}

function setBusy(busy){
  q('#dashboard').setAttribute('aria-busy',String(busy));
  q('#connect').disabled=busy;
  q('#refresh').disabled=busy||!connected;
  q('#connect').textContent=busy?'Connecting…':connected?'Reconnect':'Connect';
}

function setStatus(message,type='status'){
  const status=q('#message');
  status.textContent=message;
  status.className=type;
  status.setAttribute('role',type.includes('error')?'alert':'status');
}

function friendlyError(error){
  const message=String(error?.message||error);
  const request=error?.requestId?' Request '+error.requestId+'.':'';
  if(error?.status===401||/AUTH|JWT|TOKEN|SCOPE/i.test(message))return 'Connection rejected. Check that the token is valid, unexpired, and has profile:read access.'+request;
  if(error?.status===409)return 'The hosted state changed while this action was pending. Refresh and review the current version.'+request;
  return 'Could not load the hosted snapshot. '+message+request;
}

async function load(successMessage){
  if(!q('#token').value.trim()){
    connected=false;
    clearSnapshot('Connect with a bearer token to load data.');
    setStatus('Bearer token is required.','status error');
    q('#token').focus();
    setBusy(false);
    return false;
  }
  setBusy(true);
  setStatus('Loading the current subject snapshot…');
  try{
    const payload=await api('studio/snapshot?limit='+SNAPSHOT_LIMIT);
    const snapshot=payload.snapshot||{};
    const atomGroups=snapshot.atoms||{};
    const atoms=[...(atomGroups.candidate?.items||[]),...(atomGroups.active?.items||[]),...(atomGroups.other?.items||[])];
    model={
      snapshot,
      atoms,
      runs:Array.isArray(snapshot.runs?.items)?snapshot.runs.items:[],
      runTotal:Number.isSafeInteger(snapshot.runs?.total)?snapshot.runs.total:0,
      runSummary:{},
      proposals:Array.isArray(snapshot.updateProposals?.items)?snapshot.updateProposals.items:[],
      evaluations:Array.isArray(snapshot.evaluations?.items)?snapshot.evaluations.items:[],
      evidence:Array.isArray(snapshot.evidence?.items)?snapshot.evidence.items:[]
    };
    connected=true;
    render();
    setStatus((successMessage?successMessage+' · ':'Snapshot loaded · ')+new Date().toLocaleTimeString(),'status success');
    return true;
  }catch(error){
    connected=false;
    if(error?.status===401){
      q('#token').value='';
      clearSnapshot('Session cleared after authentication failure.');
    }
    clearSnapshot('No data is shown because the connection failed.');
    setStatus(friendlyError(error),'status error');
    q('#token').focus();
    return false;
  }finally{
    setBusy(false);
  }
}

const actionKey=()=>{
  if(window.crypto&&typeof window.crypto.randomUUID==='function')return 'studio:'+window.crypto.randomUUID();
  return 'studio:'+Date.now()+':'+Math.random().toString(36).slice(2);
};
const reasonFor=(label,details)=>{
  if(!window.confirm(label+'\n\n'+details))return null;
  const reason=window.prompt('Reason for '+label.toLowerCase()+':');
  return reason&&reason.trim()?reason.trim():null;
};
const scopeFromPrompt=(value)=>{
  const [level,...rest]=String(value||'').trim().split(':');
  if(!['user','project','task'].includes(level))return null;
  const ref=rest.join(':').trim();
  if(level!=='user'&&!ref)return null;
  return ref?{level,ref}:{level};
};
const atomDetails=(button)=>'Claim: '+(button.dataset.claim||'Unknown')+'\nScope: '+(button.dataset.scope||'Unknown')+'\nCurrent version: '+(button.dataset.version||'Unknown')+'\nEvidence: '+(button.dataset.evidence||'See lineage');

async function mutateAtom(button,operation){
  const label=operation==='confirm'?'Approve candidate':operation==='rescope'?'Rescope atom':operation==='revoke'?(button.dataset.lifecycle==='candidate'?'Reject candidate':'Revoke active atom'):'Update atom';
  const reason=reasonFor(label,atomDetails(button));
  if(!reason)return;
  let scope;
  let mode;
  if(operation==='rescope'){
    scope=scopeFromPrompt(window.prompt('New scope (for example project:merakicore or user:pratham):',button.dataset.scope||''));
    if(!scope){setStatus('A valid scope is required (user, project:name, or task:name).','status error');return;}
    mode=window.prompt('Mode (optional):',button.dataset.mode||'')||undefined;
  }
  button.disabled=true;
  setStatus(label+'â€¦');
  try{
    await api('profile/atoms/'+encodeURIComponent(button.dataset.id)+'/commands',{
      method:'POST',
      headers:{'Idempotency-Key':actionKey()},
      body:JSON.stringify({
        atom_id:button.dataset.id,
        expected_version:Number(button.dataset.version),
        operation,
        reason,
        ...(scope?{scope}:{}),
        ...(mode?{mode}: {})
      })
    });
    await load(label+' complete');
  }catch(error){
    if(error?.status===409){
      await load();
      setStatus('This atom changed in another session. The current version is shown; review it before trying again.','status error');
    }else setStatus(label+' failed. '+friendlyError(error),'status error');
    button.disabled=false;
    button.focus();
  }
}

async function mutateProposal(button,operation){
  const reason=reasonFor(operation==='approve'?'Approve proposal':operation==='reject'?'Reject proposal':'Rollback proposal','Proposal '+button.dataset.id+'\nThis changes governed future behaviour.');
  if(!reason)return;
  button.disabled=true;
  try{
    await api('update-proposals/'+encodeURIComponent(button.dataset.id)+'/commands',{
      method:'POST',
      headers:{'Idempotency-Key':actionKey()},
      body:JSON.stringify({operation,reason})
    });
    await load('Proposal '+operation+'d');
  }catch(error){
    if(error?.status===409){await load();setStatus('This proposal changed in another session. The current state is shown.','status error');}
    else setStatus('Proposal action failed. '+friendlyError(error),'status error');
    button.disabled=false;
    button.focus();
  }
}

q('#connect').addEventListener('click',()=>load());
q('#refresh').addEventListener('click',()=>load());
q('#forget').addEventListener('click',()=>{
  q('#token').value='';
  connected=false;
  clearSnapshot('Token forgotten. Connect again to inspect hosted data.');
  setStatus('Token forgotten.','status success');
  q('#token').focus();
  setBusy(false);
});
q('#token').addEventListener('keydown',(event)=>{
  if(event.key==='Enter')load();
});
q('#atoms').addEventListener('click',async(event)=>{
  const traceButton=event.target.closest('[data-trace]');
  if(traceButton){
    traceButton.disabled=true;
    setStatus('Loading learning lineage…');
    try{
      const payload=await api('profile/atoms/'+encodeURIComponent(traceButton.dataset.trace)+'/trace');
      renderLearningTrace(payload.trace||{});
      setStatus('Learning lineage loaded.','status success');
    }catch(error){
      setStatus('Could not load lineage. '+String(error?.message||error),'status error');
    }finally{
      traceButton.disabled=false;
    }
    return;
  }
  const button=event.target.closest('[data-approve]');
  if(!button)return;
  const claim=button.dataset.claim||'this candidate';
  if(!window.confirm('Approve this candidate for future matching tasks?\\n\\n'+claim))return;
  button.disabled=true;
  button.textContent='Approving…';
  setStatus('Approving candidate…');
  try{
    await api('profile/atoms/'+encodeURIComponent(button.dataset.approve)+'/commands',{
      method:'POST',
      body:JSON.stringify({
        atom_id:button.dataset.approve,
        expected_version:Number(button.dataset.version),
        operation:'confirm'
      })
    });
    await load('Candidate approved');
  }catch(error){
    setStatus('Approval failed. '+String(error?.message||error),'status error');
    button.disabled=false;
    button.textContent='Approve candidate';
    button.focus();
  }
});
q('#atoms').addEventListener('click',async(event)=>{
  const button=event.target.closest('[data-atom-action]');
  if(button)await mutateAtom(button,button.dataset.atomAction);
});
q('#proposals').addEventListener('click',async(event)=>{
  const button=event.target.closest('[data-proposal-action]');
  if(button)await mutateProposal(button,button.dataset.proposalAction);
});
</script>
</body>
</html>`;

const cspNoncePattern = /^[A-Za-z0-9_-]+$/u;

/** Render the dependency-free Studio shell for any HTTP transport. */
export const renderStudio = (options: StudioRenderOptions = {}): string => {
  if (options.nonce === undefined) return studioHtml;
  if (!cspNoncePattern.test(options.nonce) || options.nonce.length > 256) {
    throw new Error("STUDIO_CSP_NONCE_INVALID");
  }
  return studioHtml.replace(/<(style|script)(?=[\s>])/gu, `<$1 nonce="${options.nonce}"`);
};
