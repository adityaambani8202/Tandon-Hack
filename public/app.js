const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const today = () => new Date().toISOString().slice(0, 10);

let state = { plan: load("plan", null), confirmed: load("confirmed", false), start: load("start", today()),
  log: load("log", {}),        // "date|med|time" -> taken|skipped
  checkins: load("checkins", []), view: "today", large: load("large", false), voice: load("voice", false), demo: false };
const persist = () => { for (const k of ["plan", "confirmed", "start", "log", "checkins", "large", "voice"]) save(k, state[k]); };

const views = { today: "Today", ask: "Ask", checkin: "Check-in", calendar: "Appointments", diet: "Diet & Activity", caregiver: "Caregiver", doctor: "Doctor", settings: "Plan" };
function nav() {
  $("#nav").innerHTML = state.confirmed ? Object.entries(views).map(([k, v]) =>
    `<button class="${state.view === k ? "on" : "ghost"}" data-v="${k}">${v}</button>`).join("") : "";
  $("#nav").onclick = e => { const v = e.target.dataset.v; if (v) { state.view = v; render(); } };
  document.body.style.fontSize = state.large ? "26px" : "20px";
}

function render() {
  nav();
  if (!state.plan) return upload();
  if (!state.confirmed) return confirmScreen();
  ({ today: viewToday, ask: viewAsk, checkin: viewCheckin, calendar: viewCalendar, diet: viewDiet, caregiver: viewCaregiver, doctor: viewDoctor, settings: viewSettings })[state.view]();
}

/* ---------- Upload ---------- */
function upload() {
  $("#app").innerHTML = `<div class="card hero"><h1>Leave the hospital with a plan, not a pile of paper.</h1>
  <p>Recovery Reminder reads your discharge papers and turns them into a daily plan: medication reminders, appointments, diet, and warning signs. Family and doctors can follow along.</p>
  <div class="steps"><div><b>1. Scan</b><br>Photo or PDF</div><div><b>2. Confirm</b><br>You check it first</div><div><b>3. Recover</b><br>Daily reminders</div></div></div>
  <div class="card"><h2>Scan your discharge papers</h2>
  <p>Take a photo or upload a PDF. We'll pull out medications, appointments, diet and warning signs. You'll confirm everything before any reminders start.</p>
  <input type="file" id="f" accept="application/pdf,image/*" capture="environment">
  <p id="msg" class="mut"></p>
  <button id="go">Read my papers</button> <button class="ghost" id="demo">Try with sample papers</button></div>
  <p class="mut">Reminds you of what your care team already told you. It never gives medical advice.</p>`;
  const run = async file => {
    $("#msg").textContent = "Reading your papers…";
    const fd = new FormData(); if (file) fd.append("file", file);
    try {
      const r = await fetch("/api/extract", { method: "POST", body: fd }); const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      state.plan = j.plan; state.demo = j.demo; state.confirmed = false; persist(); render();
    } catch (e) { $("#msg").textContent = "Error: " + e.message; }
  };
  $("#go").onclick = () => { const f = $("#f").files[0]; f ? run(f) : ($("#msg").textContent = "Choose a file first."); };
  $("#demo").onclick = () => run(null);
}

/* ---------- Confirm (editable) ---------- */
const quote = x => x.sourceQuote ? `<div class="mut">“${esc(x.sourceQuote)}” (${esc(x.source)})</div>` : "";

function confirmScreen() {
  const p = state.plan;
  const med = (m, i) => `<div class="card"><b>${esc(m.name)}</b> <span class="mut">${esc(m.source)}</span>
    <div class="row"><div><label>Name</label><input data-k="medications.${i}.name" value="${esc(m.name)}"></div>
    <div><label>Dose</label><input data-k="medications.${i}.dose" value="${esc(m.dose)}"></div></div>
    <label>Times (24h, comma separated)</label><input data-k="medications.${i}.times" value="${esc((m.times || []).join(", "))}">
    <div class="row"><div><label>Days (blank = ongoing)</label><input data-k="medications.${i}.durationDays" value="${esc(m.durationDays ?? "")}"></div>
    <div><label>Food</label><select data-k="medications.${i}.withFood">${["any", "with", "without"].map(o => `<option ${m.withFood === o ? "selected" : ""}>${o}</option>`).join("")}</select></div></div>
    <p class="mut">${esc(m.plainLanguage || m.instructions)}</p>${quote(m)}<button class="bad" data-del="medications.${i}">Remove</button></div>`;
  const appt = (a, i) => `<div class="card"><b>${esc(a.title)}</b> <span class="mut">${esc(a.source)}</span>
    <div class="row"><input data-k="appointments.${i}.date" type="date" value="${esc(a.date)}"><input data-k="appointments.${i}.time" type="time" value="${esc(a.time)}"></div>
    <label>Location</label><input data-k="appointments.${i}.location" value="${esc(a.location)}">
    <label>What to bring / prepare</label><input data-k="appointments.${i}.prep" value="${esc(a.prep)}">${quote(a)}
    <button class="bad" data-del="appointments.${i}">Remove</button></div>`;
  const list = (arr, f) => (arr || []).map(f).join("") || `<p class="mut">None found.</p>`;
  $("#app").innerHTML = `${state.demo ? `<div class="banner">Demo mode: sample data (no API key set).</div>` : ""}
  <div class="card"><h2>Please check this carefully</h2><p>Compare each item with your papers. Fix anything wrong. A nurse or caregiver can help. <b>Reminders start only after you confirm.</b></p></div>
  <h2>Medications</h2>${list(p.medications, med)}<button class="ghost" id="addmed">+ Add medication</button>
  <h2>Appointments</h2>${list(p.appointments, appt)}
  <h2>Diet</h2>${list(p.diet, d => `<div class="card">${esc(d.rule)}<div class="mut">${esc(d.plainLanguage)} · ${esc(d.source)}</div>${quote(d)}</div>`)}
  <h2>Activity limits</h2>${list(p.activity, d => `<div class="card">${esc(d.rule)}<div class="mut">${esc(d.plainLanguage)} · ${esc(d.source)}</div>${quote(d)}</div>`)}
  <h2>Warning signs</h2>${list(p.redFlags, d => `<div class="card">⚠️ ${esc(d.symptom)} <span class="mut">${esc(d.source)}</span>${quote(d)}</div>`)}
  <div class="row"><button class="ok" id="confirm">Everything is correct. Start reminders</button><button class="ghost" id="redo">Start over</button></div>`;
  $("#app").onchange = e => {
    const k = e.target.dataset.k; if (!k) return; const [a, i, f] = k.split(".");
    let v = e.target.value;
    if (f === "times") v = v.split(",").map(s => s.trim()).filter(Boolean);
    if (f === "durationDays") v = v === "" ? null : Number(v);
    p[a][i][f] = v; if (f === "times") p[a][i].timesPerDay = v.length; persist();
  };
  $("#app").onclick = e => { const d = e.target.dataset.del; if (d) { const [a, i] = d.split("."); p[a].splice(i, 1); persist(); render(); } };
  $("#addmed").onclick = () => { p.medications.push({ name: "New medication", dose: "", times: ["08:00"], timesPerDay: 1, withFood: "any", durationDays: null, source: "added by you" }); persist(); render(); };
  $("#confirm").onclick = () => { state.confirmed = true; state.start = today(); persist(); askNotify(); render(); };
  $("#redo").onclick = () => { state.plan = null; persist(); render(); };
}

/* ---------- Schedule ---------- */
function dosesFor(date) {
  const out = [];
  const dayIdx = Math.floor((new Date(date) - new Date(state.start)) / 864e5);
  for (const m of state.plan.medications) {
    if (dayIdx < 0) continue;
    if (m.durationDays && dayIdx >= m.durationDays) continue;
    for (const t of m.times || []) out.push({ med: m, time: t, key: `${date}|${m.name}|${t}` });
  }
  return out.sort((a, b) => a.time.localeCompare(b.time));
}
const foodTxt = m => m.withFood === "with" ? " with food" : m.withFood === "without" ? " on an empty stomach" : "";
const doseText = d => `Take ${d.med.dose} of ${d.med.name}${foodTxt(d.med)} now.`;

function speak(t) { if (state.voice && "speechSynthesis" in window) speechSynthesis.speak(new SpeechSynthesisUtterance(t)); }

function viewToday() {
  const doses = dosesFor(today()); const now = new Date().toTimeString().slice(0, 5);
  const alerts = redFlagAlerts();
  $("#app").innerHTML = `${alerts}<div class="card"><h2>Today, ${new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</h2>
  ${doses.map(d => { const s = state.log[d.key]; const late = !s && d.time < now;
    return `<div class="dose"><span class="time">${d.time}</span><span style="flex:1">${esc(doseText(d))}<div class="mut">${esc(d.med.plainLanguage || "")}</div></span>
    ${s ? `<span class="tag ${s === "taken" ? "t-ok" : "t-bad"}">${s}</span>` : `${late ? `<span class="tag t-warn">due</span>` : ""}<button class="ok" data-l="${esc(d.key)}|taken">Taken</button><button class="bad" data-l="${esc(d.key)}|skipped">Skipped</button><button class="ghost" data-say="${esc(doseText(d))}">🔊</button>`}</div>`; }).join("") || "<p>No medications today.</p>"}</div>
  ${state.plan.exercises?.length ? `<div class="card"><h2>Exercises</h2>${state.plan.exercises.map(x => `<div>${esc(x.name)} <span class="mut">${esc(x.frequency)}</span></div>`).join("")}</div>` : ""}
  <p class="mut">This app only repeats your care team's instructions. It does not give medical advice.</p>`;
  $("#app").onclick = e => {
    if (e.target.dataset.l) { const [k, s] = e.target.dataset.l.split(/\|(?=[^|]*$)/); state.log[k] = s; persist(); render(); }
    if (e.target.dataset.say) speak(e.target.dataset.say);
  };
}

/* ---------- Ask about my plan ---------- */
let chat = [];
function viewAsk() {
  $("#app").innerHTML = `<div class="card"><h2>Ask about your plan</h2>
  <p class="mut">I only answer from your confirmed discharge papers. For anything else, ask your care team.</p>
  <div id="chat">${chat.map(m => `<div class="dose"><b class="time">${m.me ? "You" : "Helper"}</b><span style="flex:1;white-space:pre-wrap">${esc(m.t)}</span></div>`).join("")}</div>
  <div class="row"><input id="q" placeholder="e.g. When is my next pill?"><button id="send">Ask</button></div>
  <div class="row">${["When is my next pill?", "What appointments do I have?", "Can I lift groceries?", "What should I eat?", "When should I call the doctor?"].map(x => `<button class="ghost" data-q="${esc(x)}">${esc(x)}</button>`).join("")}</div></div>`;
  const ask = async text => {
    if (!text.trim()) return; chat.push({ me: true, t: text }); chat.push({ t: "…" }); viewAsk();
    try {
      const r = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: text, plan: state.plan, now: new Date().toLocaleString() }) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error);
      chat[chat.length - 1] = { t: j.answer }; if (state.voice) speak(j.answer);
    } catch (e) { chat[chat.length - 1] = { t: "Sorry, something went wrong: " + e.message }; }
    viewAsk();
  };
  $("#send").onclick = () => ask($("#q").value);
  $("#q").onkeydown = e => { if (e.key === "Enter") ask(e.target.value); };
  $("#app").onclick = e => { if (e.target.dataset.q) ask(e.target.dataset.q); };
}

/* ---------- Check-in & red flags ---------- */
function redFlagAlerts() {
  const last = state.checkins[state.checkins.length - 1]; if (!last || last.date !== today()) return "";
  const hits = matchFlags(last);
  return hits.length ? `<div class="alert">⚠️ You reported something your care team listed as a warning sign: ${hits.map(h => esc(h.symptom)).join("; ")}.<br>Please contact your doctor now. If it is an emergency, call 911. Let your caregiver know. They can see this alert in Caregiver view.</div>` : "";
}
function matchFlags(c) {
  const txt = (c.notes || "").toLowerCase() + (c.fever ? " fever" : "") + (c.swelling ? " swelling" : "");
  return (state.plan.redFlags || []).filter(f => (f.keywords || []).some(k => txt.includes(k.toLowerCase())));
}
function viewCheckin() {
  $("#app").innerHTML = `<div class="card"><h2>Daily check-in</h2>
  <label>Pain level: <b id="pv">3</b>/10</label><input type="range" id="pain" min="1" max="10" value="3">
  <label><input type="checkbox" id="fever" style="width:auto"> I have a fever</label>
  <label><input type="checkbox" id="swelling" style="width:auto"> I have swelling</label>
  <label>Anything else? (e.g. chest pain, bleeding)</label><textarea id="notes" rows="2"></textarea>
  <p></p><button id="sub">Submit</button></div>`;
  $("#pain").oninput = e => $("#pv").textContent = e.target.value;
  $("#sub").onclick = () => {
    state.checkins.push({ date: today(), pain: +$("#pain").value, fever: $("#fever").checked, swelling: $("#swelling").checked, notes: $("#notes").value });
    persist(); state.view = "today"; render();
  };
}

/* ---------- Calendar ---------- */
function viewCalendar() {
  const appts = [...state.plan.appointments].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  $("#app").innerHTML = `<div class="card"><h2>Appointments</h2>${appts.map(a => `<div class="dose"><span class="time">${esc(a.date)}<br>${esc(a.time)}</span>
    <span style="flex:1"><b>${esc(a.title)}</b><div class="mut">${esc(a.location)}</div>${a.prep ? `<div>📝 ${esc(a.prep)}</div>` : ""}</span></div>`).join("") || "<p>None.</p>"}
    <button id="ics">Add to my phone's calendar (.ics)</button></div>`;
  $("#ics").onclick = () => {
    const stamp = s => s.replace(/[-:]/g, "");
    const ev = appts.map((a, i) => { const st = stamp(`${a.date}T${a.time}:00`);
      return `BEGIN:VEVENT\nUID:rr-${i}-${st}@recovery\nDTSTAMP:${stamp(new Date().toISOString().slice(0, 19))}Z\nDTSTART:${st}\nSUMMARY:${a.title}\nLOCATION:${a.location || ""}\nDESCRIPTION:${a.prep || ""}\nBEGIN:VALARM\nTRIGGER:-P1D\nACTION:DISPLAY\nDESCRIPTION:Tomorrow: ${a.title}\nEND:VALARM\nBEGIN:VALARM\nTRIGGER:-PT3H\nACTION:DISPLAY\nDESCRIPTION:${a.title} in 3 hours. ${a.prep || ""}\nEND:VALARM\nEND:VEVENT`; }).join("\n");
    const url = URL.createObjectURL(new Blob([`BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Recovery Reminder//EN\n${ev}\nEND:VCALENDAR`], { type: "text/calendar" }));
    Object.assign(document.createElement("a"), { href: url, download: "appointments.ics" }).click();
  };
}

/* ---------- Diet & activity ---------- */
function viewDiet() {
  const p = state.plan;
  $("#app").innerHTML = `<div class="card"><h2>Diet rules from your papers</h2>${(p.diet || []).map(d => `<div>🥗 <b>${esc(d.rule)}</b><div class="mut">${esc(d.plainLanguage)} · ${esc(d.source)}</div></div>`).join("") || "None."}</div>
  <div class="card"><h2>Activity limits</h2>${(p.activity || []).map(d => `<div>🚫 <b>${esc(d.rule)}</b><div class="mut">${esc(d.plainLanguage)}</div></div>`).join("") || "None."}</div>
  <div class="card"><h2>Meal ideas (suggestions only)</h2><button id="meals">Generate ideas</button><div id="mealout"></div>
  <p class="mut">Your doctor's instructions always come first.</p></div>`;
  $("#meals").onclick = async () => {
    $("#mealout").textContent = "Thinking…";
    try {
      const r = await fetch("/api/meals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rules: (p.diet || []).map(d => d.rule) }) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error);
      $("#mealout").innerHTML = (j.demo ? "<div class='banner'>Sample ideas (no API key)</div>" : "") + j.meals.map(m => `<div class="dose"><b class="time">${esc(m.day)}</b><span style="flex:1">🍳 ${esc(m.breakfast)}<br>🥪 ${esc(m.lunch)}<br>🍽️ ${esc(m.dinner)}<div class="mut">Grocery: ${esc((m.grocery || []).join(", "))}</div></span></div>`).join("");
    } catch (e) { $("#mealout").textContent = "Error: " + e.message; }
  };
}

/* ---------- Caregiver & doctor ---------- */
function adherence(days = 7) {
  let t = 0, k = 0, s = 0;
  for (let i = 0; i < days; i++) { const d = new Date(); d.setDate(d.getDate() - i); const ds = d.toISOString().slice(0, 10);
    for (const x of dosesFor(ds)) { if (ds === today() && x.time > new Date().toTimeString().slice(0, 5)) continue; t++; if (state.log[x.key] === "taken") k++; if (state.log[x.key] === "skipped") s++; } }
  return { total: t, taken: k, skipped: s, missed: t - k - s, pct: t ? Math.round(100 * k / t) : 100 };
}
function status() {
  const a = adherence(), last = state.checkins[state.checkins.length - 1];
  if (last && matchFlags(last).length) return ["needs attention", "t-bad"];
  if (a.pct < 70) return ["off track", "t-bad"]; if (a.pct < 90) return ["needs attention", "t-warn"]; return ["on track", "t-ok"];
}
function viewCaregiver() {
  const a = adherence(1), [st, cls] = status();
  $("#app").innerHTML = `<div class="banner">Prototype: in production, caregivers link with their own login and get push/SMS alerts.</div>
  <div class="card"><h2>Caregiver view <span class="tag ${cls}">${st}</span></h2>
  <p>Today: ${a.taken} taken, ${a.skipped} skipped, <b>${a.missed} missed</b>.</p>${redFlagAlerts()}
  <h2>Upcoming</h2>${state.plan.appointments.map(x => `<div>${esc(x.date)} ${esc(x.time)} · ${esc(x.title)}</div>`).join("")}</div>`;
}
function viewDoctor() {
  const a = adherence(7), [st, cls] = status();
  $("#app").innerHTML = `<div class="banner">Prototype: showing one patient. The dashboard lists only flagged patients.</div>
  <div class="card"><h2>Patient summary <span class="tag ${cls}">${st}</span></h2>
  <p>7-day adherence: <b>${a.pct}%</b> (${a.taken}/${a.total} taken, ${a.skipped} skipped, ${a.missed} missed)</p>
  <h2>Recent check-ins</h2>${state.checkins.slice(-5).reverse().map(c => `<div>${c.date} · pain ${c.pain}/10${c.fever ? " · fever" : ""}${c.swelling ? " · swelling" : ""} ${esc(c.notes)}</div>`).join("") || "<p class='mut'>None yet.</p>"}
  <p class="mut">Wearable data (Fitbit steps, heart rate, sleep): planned integration.</p></div>`;
}

/* ---------- PDF export (print to PDF) ---------- */
function printPlan() {
  const p = state.plan, ad = adherence(7);
  const w = window.open("", "_blank");
  w.document.write(`<title>Recovery plan</title><style>body{font:14px system-ui;margin:32px;color:#111}h1{font-size:22px}h2{font-size:16px;border-bottom:1px solid #999;margin-top:20px}td,th{text-align:left;padding:3px 10px 3px 0;vertical-align:top}small{color:#555}</style>
  <h1>Recovery plan summary</h1><small>Generated ${new Date().toLocaleDateString()} · Reflects the patient's discharge instructions. Not medical advice.</small>
  <h2>Medications</h2><table>${p.medications.map(m => `<tr><td><b>${esc(m.name)}</b></td><td>${esc(m.dose)}</td><td>${esc((m.times || []).join(", "))}</td><td>${m.durationDays ? m.durationDays + " days" : "ongoing"}</td><td>${esc(m.withFood)} food</td></tr>`).join("")}</table>
  <h2>Appointments</h2><table>${p.appointments.map(a => `<tr><td>${esc(a.date)} ${esc(a.time)}</td><td><b>${esc(a.title)}</b></td><td>${esc(a.location)}</td><td>${esc(a.prep)}</td></tr>`).join("")}</table>
  <h2>Diet</h2><ul>${(p.diet || []).map(d => `<li>${esc(d.rule)}</li>`).join("")}</ul>
  <h2>Activity limits</h2><ul>${(p.activity || []).map(d => `<li>${esc(d.rule)}</li>`).join("")}</ul>
  <h2>Warning signs: contact your doctor</h2><ul>${(p.redFlags || []).map(d => `<li>${esc(d.symptom)}</li>`).join("")}</ul>
  <h2>7-day adherence</h2><p>${ad.pct}% (${ad.taken}/${ad.total} taken, ${ad.skipped} skipped, ${ad.missed} missed)</p>
  <h2>Recent check-ins</h2><ul>${state.checkins.slice(-7).map(c => `<li>${c.date}: pain ${c.pain}/10${c.fever ? ", fever" : ""}${c.swelling ? ", swelling" : ""} ${esc(c.notes)}</li>`).join("") || "<li>None</li>"}</ul>`);
  w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
}

/* ---------- Settings ---------- */
function viewSettings() {
  $("#app").innerHTML = `<div class="card"><h2>Settings</h2>
  <label><input type="checkbox" id="lg" style="width:auto" ${state.large ? "checked" : ""}> Extra large text</label>
  <label><input type="checkbox" id="vo" style="width:auto" ${state.voice ? "checked" : ""}> Read reminders aloud</label>
  <p></p><button id="pdf">Download plan as PDF</button> <button class="ghost" id="edit">Edit / re-confirm plan</button> <button class="bad" id="reset">Delete all data</button></div>`;
  $("#pdf").onclick = printPlan;
  $("#lg").onchange = e => { state.large = e.target.checked; persist(); nav(); };
  $("#vo").onchange = e => { state.voice = e.target.checked; persist(); };
  $("#edit").onclick = () => { state.confirmed = false; persist(); render(); };
  $("#reset").onclick = () => { if (confirm("Delete everything?")) { localStorage.clear(); location.reload(); } };
}

/* ---------- Reminders (while app is open) ---------- */
function askNotify() { if ("Notification" in window && Notification.permission === "default") Notification.requestPermission(); }
const fired = new Set();
setInterval(() => {
  if (!state.confirmed || !state.plan) return;
  const now = new Date().toTimeString().slice(0, 5);
  for (const d of dosesFor(today())) if (d.time === now && !state.log[d.key] && !fired.has(d.key)) {
    fired.add(d.key); const t = doseText(d);
    if ("Notification" in window && Notification.permission === "granted") new Notification("Medication reminder", { body: t });
    speak(t); if (state.view === "today") render();
  }
}, 15000);

render();
