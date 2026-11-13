/* ── Utilities ─────────────────────────────────────────────── */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const today = () => new Date().toISOString().slice(0, 10);
const dayDiff = (a, b) => Math.floor((new Date(a) - new Date(b)) / 864e5);

/* ── State ─────────────────────────────────────────────────── */
let state = {
  plan:      load("plan", null),
  confirmed: load("confirmed", false),
  start:     load("start", today()),
  log:       load("log", {}),
  checkins:  load("checkins", []),
  view:      "today",
  large:     load("large", false),
  voice:     load("voice", false),
  demo:      false,
};
const persist = () => {
  for (const k of ["plan","confirmed","start","log","checkins","large","voice"]) save(k, state[k]);
};

/* ── Navigation ────────────────────────────────────────────── */
const VIEWS = {
  today:"Today", checkin:"Check-in", calendar:"Appointments",
  diet:"Diet", caregiver:"Caregiver", doctor:"Doctor", settings:"Plan",
};

function missedCount() {
  if (!state.plan?.medications || !state.confirmed) return 0;
  const now = new Date().toTimeString().slice(0, 5);
  return dosesFor(today()).filter(d => d.time < now && !state.log[d.key]).length;
}

function nav() {
  const mc = missedCount();
  $("#nav").innerHTML = state.confirmed
    ? Object.entries(VIEWS).map(([k, v]) =>
        `<button class="${state.view===k?"on":"ghost"}" data-v="${k}" aria-current="${state.view===k?"page":"false"}">${v}${k==="today"&&mc>0?`<span class="badge" aria-label="${mc} overdue">${mc}</span>`:""}</button>`
      ).join("") : "";
  $("#nav").onclick = e => { const v = e.target.closest("[data-v]")?.dataset.v; if (v) { state.view=v; render(); } };
  document.body.style.fontSize = state.large ? "24px" : "20px";
}

function render() {
  nav();
  if (!state.plan) return upload();
  if (!state.confirmed) return confirmScreen();
  ({today:viewToday,checkin:viewCheckin,calendar:viewCalendar,diet:viewDiet,
    caregiver:viewCaregiver,doctor:viewDoctor,settings:viewSettings})[state.view]?.();
}

/* ── Upload ────────────────────────────────────────────────── */
function upload() {
  $("#app").innerHTML = `<div class="card hero">
    <div class="hero-icon" aria-hidden="true">💊</div>
    <h2>Recovery Reminder</h2>
    <p>Scan your hospital discharge papers. We will pull out your medications, appointments and warning signs. <strong>You confirm everything before any reminder starts.</strong></p>
    <input type="file" id="f" accept="application/pdf,image/*" capture="environment" aria-label="Choose discharge paper file" style="display:none">
    <button id="cam" class="btn-full">📷 Take a photo or upload PDF</button>
    <button class="ghost btn-full" id="demo">Try with sample papers</button>
    <p id="msg" class="mut small" aria-live="polite"></p>
  </div>`;
  const run = async file => {
    $("#msg").textContent = "Reading your papers…";
    const btn = $("#cam"); btn.disabled=true; btn.textContent="Reading…";
    const fd = new FormData(); if (file) fd.append("file", file);
    try {
      const r = await fetch("/api/extract", {method:"POST",body:fd});
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      state.plan=j.plan; state.demo=j.demo; state.confirmed=false; persist(); render();
    } catch(e) {
      $("#msg").textContent = "Error: " + e.message;
      btn.disabled=false; btn.textContent="📷 Take a photo or upload PDF";
    }
  };
  $("#cam").onclick = () => $("#f").click();
  $("#f").onchange = e => { if (e.target.files[0]) run(e.target.files[0]); };
  $("#demo").onclick = () => run(null);
}

/* ── Confirm screen ────────────────────────────────────────── */
function confirmScreen() {
  const p = state.plan;
  const med = (m, i) => `<div class="card">
    <div class="card-label">Source: ${esc(m.source)}</div>
    <div class="row">
      <div><label>Medication name</label><input data-k="medications.${i}.name" value="${esc(m.name)}"></div>
      <div><label>Dose</label><input data-k="medications.${i}.dose" value="${esc(m.dose)}"></div>
    </div>
    <label>Times (24h, comma-separated e.g. 08:00, 20:00)</label>
    <input data-k="medications.${i}.times" value="${esc((m.times||[]).join(", "))}">
    <div class="row">
      <div><label>Duration (days, blank = ongoing)</label><input type="number" min="0" data-k="medications.${i}.durationDays" value="${esc(m.durationDays??"")}"></div>
      <div><label>Take with food?</label><select data-k="medications.${i}.withFood">${["any","with","without"].map(o=>`<option ${m.withFood===o?"selected":""}>${o}</option>`).join("")}</select></div>
      <div><label>Supply (days on hand)</label><input type="number" min="0" data-k="medications.${i}.supplyDays" value="${esc(m.supplyDays??"")}"></div>
    </div>
    ${m.taperSteps?.length?`<div class="banner">Taper: ${m.taperSteps.map(s=>`${esc(s.dose)} x ${s.days} days`).join(" -> ")}</div>`:""}
    <p class="mut small">${esc(m.plainLanguage||m.instructions||"")}</p>
    <button class="bad sm" data-del="medications.${i}" aria-label="Remove ${esc(m.name)}">Remove</button>
  </div>`;
  const appt = (a, i) => `<div class="card">
    <div class="card-label">Source: ${esc(a.source)}</div>
    <div class="row">
      <div><label>Date</label><input data-k="appointments.${i}.date" type="date" value="${esc(a.date)}"></div>
      <div><label>Time</label><input data-k="appointments.${i}.time" type="time" value="${esc(a.time)}"></div>
    </div>
    <label>Title</label><input data-k="appointments.${i}.title" value="${esc(a.title)}">
    <label>Location</label><input data-k="appointments.${i}.location" value="${esc(a.location)}">
    <label>Prep notes</label><input data-k="appointments.${i}.prep" value="${esc(a.prep)}">
    <button class="bad sm" data-del="appointments.${i}">Remove</button>
  </div>`;
  const list = (arr, f) => (arr||[]).map(f).join("") || `<p class="mut">None found in document.</p>`;
  $("#app").innerHTML = `${state.demo?`<div class="banner" role="status">Demo mode — using sample data (no API key set).</div>`:""}
  <div class="card"><h2>Check everything carefully</h2>
  <p>Compare each item with your papers. Fix anything wrong. <strong>Reminders only start after you confirm.</strong></p>
  <p class="mut small">Found: ${p.medications?.length||0} medications · ${p.appointments?.length||0} appointments · ${p.redFlags?.length||0} warning signs</p></div>
  <h2>Medications</h2>${list(p.medications,med)}
  <button class="ghost" id="addmed">+ Add a medication</button>
  <h2>Appointments</h2>${list(p.appointments,appt)}
  <h2>Diet rules</h2>${list(p.diet,d=>`<div class="card">${esc(d.rule)}<div class="mut small">${esc(d.plainLanguage)} · ${esc(d.source)}</div></div>`)}
  <h2>Activity limits</h2>${list(p.activity,d=>`<div class="card">${esc(d.rule)}<div class="mut small">${esc(d.plainLanguage)}</div></div>`)}
  <h2>Warning signs</h2>${list(p.redFlags,d=>`<div class="card warn-card">⚠️ ${esc(d.symptom)} <span class="mut small">${esc(d.source)}</span></div>`)}
  <div style="height:16px"></div>
  <div class="row">
    <button class="ok btn-full" id="confirm">Everything is correct — Start reminders</button>
    <button class="ghost" id="redo">Start over</button>
  </div>`;
  $("#app").onchange = e => {
    const k = e.target.dataset.k; if (!k) return;
    const [a, i, f] = k.split(".");
    let v = e.target.value;
    if (f==="times") v = v.split(",").map(s=>s.trim()).filter(Boolean);
    else if (f==="durationDays"||f==="supplyDays") v = v===""?null:Number(v);
    p[a][i][f] = v;
    if (f==="times") p[a][i].timesPerDay = v.length;
    persist();
  };
  $("#app").onclick = e => {
    const d = e.target.dataset.del;
    if (d) { const [a,i] = d.split("."); p[a].splice(+i,1); persist(); render(); }
  };
  $("#addmed").onclick = () => {
    p.medications.push({name:"New medication",dose:"",times:["08:00"],timesPerDay:1,withFood:"any",durationDays:null,supplyDays:null,source:"added by you",plainLanguage:""});
    persist(); render();
  };
  $("#confirm").onclick = () => { state.confirmed=true; state.start=today(); persist(); askNotify(); render(); };
  $("#redo").onclick = () => { state.plan=null; persist(); render(); };
}

/* ── Schedule engine ───────────────────────────────────────── */
function currentDose(med, dayIdx) {
  if (!med.taperSteps?.length) return med.dose;
  let d = 0;
  for (const step of med.taperSteps) { d += step.days; if (dayIdx < d) return step.dose; }
  return null;
}

function dosesFor(date) {
  const out = [];
  const dayIdx = Math.floor((new Date(date) - new Date(state.start)) / 864e5);
  for (const m of state.plan?.medications || []) {
    if (dayIdx < 0) continue;
    if (m.taperSteps?.length) {
      if (dayIdx >= m.taperSteps.reduce((s,x)=>s+x.days,0)) continue;
    } else if (m.durationDays && dayIdx >= m.durationDays) continue;
    const dose = currentDose(m, dayIdx);
    if (dose==null) continue;
    for (const t of m.times||[]) out.push({med:m,dose,time:t,key:`${date}|${m.name}|${t}`});
  }
  return out.sort((a,b)=>a.time.localeCompare(b.time));
}

const SECTIONS = [
  {label:"Morning",   icon:"🌅", from:"00:00", to:"11:59"},
  {label:"Afternoon", icon:"☀️",  from:"12:00", to:"16:59"},
  {label:"Evening",   icon:"🌆", from:"17:00", to:"20:59"},
  {label:"Bedtime",   icon:"🌙", from:"21:00", to:"23:59"},
];
const foodTxt = m => m.withFood==="with"?" · Take with food":m.withFood==="without"?" · Take on empty stomach":"";
const doseText = d => `Take ${d.dose} of ${d.med.name}${foodTxt(d.med)}.`;
function speak(t) { if (state.voice && "speechSynthesis" in window) speechSynthesis.speak(new SpeechSynthesisUtterance(t)); }

/* ── Red flags ─────────────────────────────────────────────── */
const EMERGENCY_TERMS = ["chest pain","trouble breathing","shortness of breath","cannot breathe","not breathing","unconscious","stroke","seizure","heart attack","difficulty breathing"];
const isEmergency = sym => EMERGENCY_TERMS.some(k=>sym.toLowerCase().includes(k));

function matchFlags(checkin) {
  const txt = [checkin.notes||"", checkin.fever?"fever chills":"", checkin.swelling?"swelling redness":"", checkin.pain>7?"severe pain":""].join(" ").toLowerCase();
  return (state.plan?.redFlags||[]).filter(f=>(f.keywords||[]).some(k=>txt.includes(k.toLowerCase())));
}

function redFlagAlerts() {
  const last = state.checkins[state.checkins.length-1];
  if (!last || last.date!==today()) return "";
  const hits = matchFlags(last);
  if (!hits.length) return "";
  const emergencies = hits.filter(h=>isEmergency(h.symptom));
  const warnings = hits.filter(h=>!isEmergency(h.symptom));
  let out = "";
  if (emergencies.length) out += `<div class="emergency" role="alert">🚨 ${emergencies.map(h=>esc(h.symptom)).join("; ")} — <strong>Call 911 immediately.</strong></div>`;
  if (warnings.length) out += `<div class="alert" role="alert">⚠️ ${warnings.map(h=>esc(h.symptom)).join("; ")}<br>Your discharge papers say to contact your care team.</div>`;
  return out;
}

/* ── Refill warnings ───────────────────────────────────────── */
function refillWarnings() {
  if (!state.plan?.medications) return "";
  const dayIdx = dayDiff(today(), state.start);
  const warns = state.plan.medications.filter(m => {
    if (!m.supplyDays) return false;
    const remaining = m.supplyDays - dayIdx;
    return remaining <= 7 && remaining > 0;
  });
  if (!warns.length) return "";
  return `<div class="refill-warn" role="status">💊 Refill needed soon: ${warns.map(m=>esc(m.name)).join(", ")}. Contact your pharmacy.</div>`;
}

/* ── Today view ────────────────────────────────────────────── */
function viewToday() {
  const doses = dosesFor(today());
  const now = new Date().toTimeString().slice(0,5);
  const taken   = doses.filter(d=>state.log[d.key]==="taken").length;
  const skipped = doses.filter(d=>state.log[d.key]==="skipped").length;
  const missed  = doses.filter(d=>!state.log[d.key]&&d.time<now).length;
  let sections = "";
  for (const sec of SECTIONS) {
    const sdoses = doses.filter(d=>d.time>=sec.from&&d.time<=sec.to);
    if (!sdoses.length) continue;
    sections += `<div class="section-header">${sec.icon} ${sec.label}</div>
    ${sdoses.map(d=>{
      const s = state.log[d.key];
      const late = !s && d.time < now;
      const isTaper = d.med.taperSteps?.length && d.dose!==d.med.dose;
      return `<div class="dose" role="listitem">
        <span class="time">${d.time}</span>
        <span style="flex:1">
          <strong>${esc(d.med.name)}</strong> ${esc(d.dose)}
          ${isTaper?`<span class="tag t-warn" style="font-size:.72em">Taper</span>`:""}
          <div class="mut small">${esc(d.med.plainLanguage||"")}${foodTxt(d.med)}</div>
        </span>
        ${s?`<span class="tag ${s==="taken"?"t-ok":"t-bad"}">${s}</span>`:`<span class="dose-actions">
          ${late?`<span class="tag t-warn">overdue</span>`:""}
          <button class="ok sm" data-l="${esc(d.key)}|taken" aria-label="Mark ${esc(d.med.name)} taken">Taken</button>
          <button class="bad sm" data-l="${esc(d.key)}|skipped" aria-label="Skip ${esc(d.med.name)}">Skip</button>
          <button class="ghost sm" data-say="${esc(doseText(d))}" aria-label="Read aloud">🔊</button>
        </span>`}
      </div>`;
    }).join("")}`;
  }
  if (!doses.length) sections = `<p class="mut">No medications scheduled for today.</p>`;
  const exs = state.plan.exercises?.length
    ? `<div class="card"><h2>Exercises</h2>${state.plan.exercises.map(x=>`<div class="dose"><span style="flex:1"><strong>${esc(x.name)}</strong><div class="mut small">${esc(x.frequency)}</div></span></div>`).join("")}</div>`:""
  ;
  $("#app").innerHTML = `${redFlagAlerts()}${refillWarnings()}
  <div class="card">
    <h2>${new Date().toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric"})}</h2>
    <div class="pill-row">
      ${taken?`<span class="tag t-ok">${taken} taken</span>`:""}
      ${skipped?`<span class="tag t-bad">${skipped} skipped</span>`:""}
      ${missed?`<span class="tag t-warn">${missed} overdue</span>`:""}
      ${!taken&&!skipped&&!missed&&doses.length?`<span class="mut small">No doses logged yet</span>`:""}
    </div>
    <div role="list">${sections}</div>
  </div>
  ${exs}
  <p class="mut small">This app only repeats your care team's instructions. It does not give medical advice.</p>`;
  $("#app").onclick = e => {
    if (e.target.dataset.l) { const [k,s]=e.target.dataset.l.split(/\|(?=[^|]*$)/); state.log[k]=s; persist(); render(); }
    if (e.target.dataset.say) speak(e.target.dataset.say);
  };
}

/* ── Check-in ──────────────────────────────────────────────── */
function viewCheckin() {
  const doneToday = state.checkins.some(c=>c.date===today());
  if (doneToday) {
    const c = state.checkins[state.checkins.length-1];
    const hits = matchFlags(c);
    $("#app").innerHTML = `<div class="card"><h2>Today's check-in complete ✓</h2>
    <p>Pain: ${c.pain}/10${c.fever?" · Fever":""}${c.swelling?" · Swelling":""}</p>
    ${c.notes?`<p class="mut small">${esc(c.notes)}</p>`:""}
    ${hits.length?`<div class="alert" role="alert">⚠️ ${hits.map(h=>esc(h.symptom)).join("; ")} — Contact your care team.</div>`:""}
    <button class="ghost" id="redo">Fill in again</button></div>`;
    $("#redo").onclick = () => { state.checkins.pop(); persist(); render(); };
    return;
  }
  $("#app").innerHTML = `<div class="card"><h2>Daily check-in</h2>
  <p>Takes about 60 seconds. Answer honestly — this helps track your recovery.</p>
  <label for="pain">Pain level today: <strong id="pv">3</strong> / 10</label>
  <input type="range" id="pain" min="0" max="10" value="3" style="width:100%">
  <label><input type="checkbox" id="fever" style="width:auto;margin-right:8px"> I have a fever or chills</label>
  <label><input type="checkbox" id="swelling" style="width:auto;margin-right:8px"> I have swelling or redness</label>
  <label for="notes">Anything else? (describe any new symptoms)</label>
  <textarea id="notes" rows="3" placeholder="e.g. chest pain, dizziness, bleeding…"></textarea>
  <p class="mut small">If you have chest pain or trouble breathing, call 911 immediately.</p>
  <button id="sub" class="ok btn-full">Submit check-in</button>
  </div>`;
  $("#pain").oninput = e => $("#pv").textContent = e.target.value;
  $("#sub").onclick = () => {
    state.checkins.push({date:today(),pain:+$("#pain").value,fever:$("#fever").checked,swelling:$("#swelling").checked,notes:$("#notes").value});
    persist(); state.view="today"; render();
  };
}

/* ── Calendar ──────────────────────────────────────────────── */
function viewCalendar() {
  const appts = [...(state.plan.appointments||[])].sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time));
  const upcoming = appts.filter(a=>a.date>=today());
  const past = appts.filter(a=>a.date<today());
  const apptCard = a => {
    const daysAway = dayDiff(a.date,today());
    const badge = daysAway===0?`<span class="tag t-warn">Today</span>`:daysAway===1?`<span class="tag t-warn">Tomorrow</span>`:daysAway>1?`<span class="tag" style="background:#e8f0ff;color:#1d5fd6">In ${daysAway} days</span>`:`<span class="tag" style="background:var(--line);color:var(--mut)">Past</span>`;
    return `<div class="dose">
      <span class="time" style="min-width:80px">${esc(a.date)}<br><small>${esc(a.time)}</small></span>
      <span style="flex:1"><strong>${esc(a.title)}</strong> ${badge}
        ${a.location?`<div class="mut small">📍 ${esc(a.location)}</div>`:""}
        ${a.prep?`<div class="prep-note">📝 ${esc(a.prep)}</div>`:""}
      </span>
    </div>`;
  };
  $("#app").innerHTML = `<div class="card"><h2>Upcoming</h2>${upcoming.map(apptCard).join("")||"<p class='mut'>No upcoming appointments.</p>"}</div>
  ${past.length?`<div class="card"><h2>Past</h2>${past.map(apptCard).join("")}</div>`:""}
  <button id="ics" class="ghost">📅 Download to phone calendar (.ics)</button>`;
  $("#ics").onclick = () => {
    const stamp = s=>s.replace(/[-:]/g,"");
    const ev = appts.map((a,i)=>{const st=stamp(`${a.date}T${a.time||"09:00"}:00`);return `BEGIN:VEVENT\nUID:rr-${i}-${st}@recovery\nDTSTAMP:${stamp(new Date().toISOString().slice(0,19))}Z\nDTSTART:${st}\nSUMMARY:${a.title}\nLOCATION:${a.location||""}\nDESCRIPTION:${a.prep||""}\nBEGIN:VALARM\nTRIGGER:-P1D\nACTION:DISPLAY\nDESCRIPTION:Tomorrow: ${a.title}\nEND:VALARM\nBEGIN:VALARM\nTRIGGER:-PT3H\nACTION:DISPLAY\nDESCRIPTION:${a.title} in 3 hours. ${a.prep||""}\nEND:VALARM\nEND:VEVENT`;}).join("\n");
    const url=URL.createObjectURL(new Blob([`BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Recovery Reminder//EN\n${ev}\nEND:VCALENDAR`],{type:"text/calendar"}));
    Object.assign(document.createElement("a"),{href:url,download:"appointments.ics"}).click();
  };
}

/* ── Diet & activity ───────────────────────────────────────── */
function viewDiet() {
  const p = state.plan;
  $("#app").innerHTML = `<div class="card"><h2>Diet rules</h2>
  ${(p.diet||[]).map(d=>`<div class="rule-row">🥗 <span><strong>${esc(d.rule)}</strong><div class="mut small">${esc(d.plainLanguage)} · ${esc(d.source)}</div></span></div>`).join("")||"<p class='mut'>None found.</p>"}
  </div>
  <div class="card"><h2>Activity limits</h2>
  ${(p.activity||[]).map(d=>`<div class="rule-row">🚫 <span><strong>${esc(d.rule)}</strong><div class="mut small">${esc(d.plainLanguage)}</div></span></div>`).join("")||"<p class='mut'>None found.</p>"}
  </div>
  <div class="card"><h2>Meal ideas <span class="mut small">— suggestions only</span></h2>
  <button id="meals" class="ghost">Generate 3-day meal ideas</button><div id="mealout"></div>
  <p class="mut small">Your doctor's instructions come first.</p></div>`;
  $("#meals").onclick = async () => {
    $("#mealout").textContent = "Thinking…";
    try {
      const r = await fetch("/api/meals",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({rules:(p.diet||[]).map(d=>d.rule)})});
      const j = await r.json(); if (!r.ok) throw new Error(j.error);
      $("#mealout").innerHTML=(j.demo?`<div class="banner">Sample ideas — no API key</div>`:"")
        +j.meals.map(m=>`<div class="meal-day"><b>${esc(m.day)}</b><div>🍳 ${esc(m.breakfast)}</div><div>🥪 ${esc(m.lunch)}</div><div>🍽️ ${esc(m.dinner)}</div><div class="mut small">Grocery: ${esc((m.grocery||[]).join(", "))}</div></div>`).join("");
    } catch(e) { $("#mealout").textContent = "Error: " + e.message; }
  };
}

/* ── Adherence helpers ─────────────────────────────────────── */
function adherence(days=7) {
  let total=0, taken=0, skipped=0;
  for (let i=0;i<days;i++) {
    const d=new Date(); d.setDate(d.getDate()-i);
    const ds=d.toISOString().slice(0,10);
    const cutoff=ds===today()?new Date().toTimeString().slice(0,5):"23:59";
    for (const x of dosesFor(ds)) {
      if (x.time>cutoff) continue;
      total++;
      if (state.log[x.key]==="taken") taken++;
      if (state.log[x.key]==="skipped") skipped++;
    }
  }
  return {total,taken,skipped,missed:total-taken-skipped,pct:total?Math.round(100*taken/total):100};
}

function status() {
  const a=adherence(), last=state.checkins[state.checkins.length-1];
  if (last&&matchFlags(last).length) return ["needs attention","t-bad"];
  if (a.pct<70) return ["off track","t-bad"];
  if (a.pct<90) return ["needs attention","t-warn"];
  return ["on track","t-ok"];
}

/* ── 7-day bar chart ───────────────────────────────────────── */
function adherenceChart(days=7) {
  const H=52, barW=26, gap=12;
  const cols=[];
  for (let i=days-1;i>=0;i--) {
    const d=new Date(); d.setDate(d.getDate()-i);
    const ds=d.toISOString().slice(0,10);
    const cutoff=ds===today()?new Date().toTimeString().slice(0,5):"23:59";
    const doses=dosesFor(ds).filter(x=>x.time<=cutoff);
    const t=doses.filter(x=>state.log[x.key]==="taken").length;
    const s=doses.filter(x=>state.log[x.key]==="skipped").length;
    cols.push({t,s,m:doses.length-t-s,total:doses.length,label:d.toLocaleDateString(undefined,{weekday:"short"}).slice(0,2)});
  }
  const maxBar=Math.max(1,...cols.map(c=>c.total));
  const W=cols.length*(barW+gap)-gap;
  const rects=cols.map((c,i)=>{
    const x=i*(barW+gap);
    if (!c.total) return `<rect x="${x}" y="${H-3}" width="${barW}" height="3" fill="#dde3ee" rx="2"/><text x="${x+barW/2}" y="${H+13}" text-anchor="middle" font-size="10" fill="#9aa7bd">${c.label}</text>`;
    const th=Math.round(H*c.t/maxBar), sh=Math.round(H*c.s/maxBar), mh=Math.round(H*c.m/maxBar);
    const y0=H-(th+sh+mh);
    return `<rect x="${x}" y="${y0}" width="${barW}" height="${th}" fill="#1e8e4e" rx="2 2 0 0"/>
      <rect x="${x}" y="${y0+th}" width="${barW}" height="${sh}" fill="#c0292b"/>
      <rect x="${x}" y="${y0+th+sh}" width="${barW}" height="${mh}" fill="#c27a00" rx="0 0 2 2"/>
      <text x="${x+barW/2}" y="${H+13}" text-anchor="middle" font-size="10" fill="#9aa7bd">${c.label}</text>`;
  }).join("");
  return `<div class="chart-wrap"><svg viewBox="0 0 ${W} ${H+16}" style="width:100%;display:block" aria-label="7-day adherence chart">${rects}</svg>
    <div class="chart-legend"><span style="color:#1e8e4e">■ Taken</span><span style="color:#c0292b">■ Skipped</span><span style="color:#c27a00">■ Missed</span></div>
  </div>`;
}

/* ── Caregiver view ────────────────────────────────────────── */
function viewCaregiver() {
  const a1=adherence(1), a7=adherence(7), [st,cls]=status();
  const last=state.checkins[state.checkins.length-1];
  const upcoming=(state.plan.appointments||[]).filter(a=>a.date>=today()).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time)).slice(0,3);
  $("#app").innerHTML = `<div class="banner">In production, caregivers link with their own account and receive SMS/push alerts for missed doses.</div>
  <div class="card"><h2>Patient status <span class="tag ${cls}">${st}</span></h2>
  <p>Today: <strong>${a1.taken}</strong> taken · ${a1.skipped} skipped · <strong style="color:var(--warn)">${a1.missed}</strong> overdue</p>
  <p>7-day adherence: <strong>${a7.pct}%</strong> (${a7.taken}/${a7.total} doses)</p>
  ${adherenceChart(7)}${redFlagAlerts()}</div>
  ${last?`<div class="card"><h2>Last check-in <span class="mut small">${last.date}</span></h2>
  <p>Pain: ${last.pain}/10${last.fever?" · Fever":""}${last.swelling?" · Swelling":""}</p>
  ${last.notes?`<p class="mut small">${esc(last.notes)}</p>`:""}
  ${matchFlags(last).length?`<div class="alert">⚠️ ${matchFlags(last).map(h=>esc(h.symptom)).join("; ")}</div>`:""}</div>`:""}
  <div class="card"><h2>Upcoming appointments</h2>
  ${upcoming.map(a=>{const da=dayDiff(a.date,today());return `<div class="dose"><span class="time">${esc(a.date)}</span><span style="flex:1"><strong>${esc(a.title)}</strong><div class="mut small">${da===0?"Today":da===1?"Tomorrow":`In ${da} days`} · ${esc(a.location)}</div></span></div>`;}).join("")||"<p class='mut'>None upcoming.</p>"}</div>`;
}

/* ── Doctor view ───────────────────────────────────────────── */
function viewDoctor() {
  const a7=adherence(7), [st,cls]=status();
  const recent=state.checkins.slice(-7).reverse();
  $("#app").innerHTML = `<div class="banner">Prototype — production shows all patients with on track / needs attention / off track status.</div>
  <div class="card"><h2>Patient summary <span class="tag ${cls}">${st}</span></h2>
  <p>7-day adherence: <strong>${a7.pct}%</strong> (${a7.taken}/${a7.total} taken · ${a7.skipped} skipped · ${a7.missed} missed)</p>
  ${adherenceChart(7)}</div>
  <div class="card"><h2>Recent check-ins</h2>
  ${recent.map(c=>`<div class="dose">
    <span class="time" style="min-width:90px">${c.date}</span>
    <span style="flex:1">Pain ${c.pain}/10${c.fever?" · Fever":""}${c.swelling?" · Swelling":""} ${esc(c.notes||"")}</span>
    ${matchFlags(c).length?`<span class="tag t-bad">flag</span>`:""}
  </div>`).join("")||"<p class='mut'>No check-ins yet.</p>"}
  </div>
  <button class="ghost" id="pdf">📄 Export patient summary PDF</button>`;
  $("#pdf").onclick = printPlan;
}

/* ── PDF export ────────────────────────────────────────────── */
function printPlan() {
  const p=state.plan, ad=adherence(7);
  const w=window.open("","_blank");
  w.document.write(`<title>Recovery plan</title><style>body{font:14px system-ui;margin:32px;color:#111}h1{font-size:22px}h2{font-size:16px;border-bottom:1px solid #ccc;margin-top:20px}td,th{text-align:left;padding:4px 12px 4px 0;vertical-align:top}small{color:#555}ul{padding-left:20px}li{margin:4px 0}</style>
  <h1>Recovery plan</h1><small>Printed ${new Date().toLocaleDateString()} — reflects discharge instructions. This is not medical advice.</small>
  <h2>Medications</h2><table>${(p.medications||[]).map(m=>`<tr><td><b>${esc(m.name)}</b></td><td>${esc(m.dose)}</td><td>${esc((m.times||[]).join(", "))}</td><td>${m.durationDays?m.durationDays+" days":"ongoing"}</td><td>${esc(m.withFood)} food</td></tr>`).join("")}</table>
  <h2>Appointments</h2><table>${(p.appointments||[]).map(a=>`<tr><td>${esc(a.date)} ${esc(a.time)}</td><td><b>${esc(a.title)}</b></td><td>${esc(a.location)}</td><td>${esc(a.prep)}</td></tr>`).join("")}</table>
  <h2>Diet rules</h2><ul>${(p.diet||[]).map(d=>`<li>${esc(d.rule)}</li>`).join("")||"<li>None</li>"}</ul>
  <h2>Activity limits</h2><ul>${(p.activity||[]).map(d=>`<li>${esc(d.rule)}</li>`).join("")||"<li>None</li>"}</ul>
  <h2>Warning signs</h2><ul>${(p.redFlags||[]).map(d=>`<li>${esc(d.symptom)}</li>`).join("")||"<li>None</li>"}</ul>
  <h2>7-day adherence</h2><p>${ad.pct}% (${ad.taken}/${ad.total} taken · ${ad.skipped} skipped · ${ad.missed} missed)</p>
  <h2>Recent check-ins</h2><ul>${state.checkins.slice(-7).map(c=>`<li>${c.date}: pain ${c.pain}/10${c.fever?", fever":""}${c.swelling?", swelling":""} ${esc(c.notes||"")}</li>`).join("")||"<li>None yet</li>"}</ul>`);
  w.document.close(); w.focus(); setTimeout(()=>w.print(),300);
}

/* ── Settings ──────────────────────────────────────────────── */
function viewSettings() {
  const daysSince=dayDiff(today(),state.start);
  $("#app").innerHTML = `<div class="card"><h2>Settings</h2>
  <p class="mut small">Recovery started: ${esc(state.start)} · Day ${daysSince+1}</p>
  <label><input type="checkbox" id="lg" style="width:auto;margin-right:8px" ${state.large?"checked":""}> Extra large text (accessibility)</label>
  <label><input type="checkbox" id="vo" style="width:auto;margin-right:8px" ${state.voice?"checked":""}> Read reminders aloud</label>
  <div style="height:12px"></div>
  <button id="pdf" class="ghost btn-full">📄 Download plan as PDF</button>
  <button class="ghost btn-full" id="edit">✏️ Edit / re-confirm plan</button>
  <button class="bad btn-full" id="reset">🗑️ Delete all data and start over</button>
  <p class="mut small" style="margin-top:12px">This app does not replace your care team. If you have questions about your recovery, contact your doctor or nurse.</p>
  </div>`;
  $("#pdf").onclick=printPlan;
  $("#lg").onchange=e=>{state.large=e.target.checked;persist();nav();};
  $("#vo").onchange=e=>{state.voice=e.target.checked;persist();};
  $("#edit").onclick=()=>{state.confirmed=false;persist();render();};
  $("#reset").onclick=()=>{ if(confirm("Delete all data? This cannot be undone.")) {localStorage.clear();location.reload();} };
}

/* ── Notifications ────────────────────────────────────────── */
function askNotify() {
  if ("Notification" in window && Notification.permission==="default") Notification.requestPermission();
}

const fired = new Set();
setInterval(() => {
  if (!state.confirmed || !state.plan) return;
  const now = new Date().toTimeString().slice(0,5);
  for (const d of dosesFor(today())) {
    if (d.time!==now || state.log[d.key] || fired.has(d.key)) continue;
    fired.add(d.key);
    const t = doseText(d);
    if ("Notification" in window && Notification.permission==="granted") {
      try { new Notification("Medication reminder",{body:t,tag:d.key,data:{key:d.key},actions:[{action:"taken",title:"Taken ✓"},{action:"skipped",title:"Skip"}]}); } catch {}
    }
    speak(t);
    if (state.view==="today") render();
  }
}, 15000);

/* ── Service worker ───────────────────────────────────────── */
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("message", e => {
    if (e.data?.type==="logDose") { state.log[e.data.key]=e.data.status; persist(); if(state.view==="today") render(); }
  });
  navigator.serviceWorker.register("/sw.js").catch(()=>{});
}

/* ── Handle notification deep-link ───────────────────────── */
(function() {
  const p=new URLSearchParams(location.search);
  const action=p.get("notif"), key=p.get("key");
  if (action && key && state.confirmed) { state.log[key]=action; persist(); history.replaceState(null,"","/"); }
})();

render();
