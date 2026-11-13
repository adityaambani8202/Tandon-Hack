import express from "express";
import multer from "multer";
import Anthropic from "@anthropic-ai/sdk";

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
app.set("trust proxy", 1);
app.use(express.static("public"));
app.get("/healthz", (_req, res) => res.send("ok"));

// Simple in-memory rate limit for the paid AI endpoints (per IP, per minute).
const hits = new Map();
const LIMIT = Number(process.env.RATE_LIMIT_PER_MIN || 10);
function rateLimit(req, res, next) {
  const now = Date.now(), h = (hits.get(req.ip) || []).filter(t => now - t < 60000);
  if (h.length >= LIMIT) return res.status(429).json({ error: "Too many requests. Please wait a minute." });
  h.push(now); hits.set(req.ip, h); next();
}
setInterval(() => { const now = Date.now(); for (const [ip, h] of hits) if (!h.some(t => now - t < 60000)) hits.delete(ip); }, 60000).unref();
const ALLOWED = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp", "image/gif"]);

const HAS_AI = () => !!(process.env.ANTHROPIC_API_KEY || process.env.GEMINI_API_KEY);
// Claude if ANTHROPIC_API_KEY is set, else Gemini (free tier) if GEMINI_API_KEY is set.
async function askModel({ prompt, file, max = 4096, json = true }) {
  if (process.env.ANTHROPIC_API_KEY) {
    const content = [];
    if (file) {
      const data = file.buffer.toString("base64");
      content.push(file.mimetype === "application/pdf"
        ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
        : { type: "image", source: { type: "base64", media_type: file.mimetype, data } });
    }
    content.push({ type: "text", text: prompt });
    const msg = await new Anthropic().messages.create({ model: "claude-sonnet-5-5", max_tokens: max, messages: [{ role: "user", content }] });
    return msg.content.filter(c => c.type === "text").map(c => c.text).join("");
  }
  const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";
  const parts = [];
  if (file) parts.push({ inline_data: { mime_type: file.mimetype, data: file.buffer.toString("base64") } });
  parts.push({ text: prompt });
  let r, j;
  for (let attempt = 0; attempt < 3; attempt++) {
    r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
      body: JSON.stringify({ contents: [{ parts }], generationConfig: { ...(json ? { responseMimeType: "application/json" } : {}), maxOutputTokens: max } }),
      signal: AbortSignal.timeout(30000),
    });
    j = await r.json();
    if (r.status !== 429 && r.status !== 503) break;     // retry only on overload/rate limit
    await new Promise(res => setTimeout(res, 2000 * (attempt + 1)));
  }
  if (!r.ok) throw new Error(j.error?.message || "Gemini request failed");
  return (j.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("");
}

const PROMPT = `You extract structured data from hospital discharge paperwork. Return ONLY valid JSON, no prose:
{
 "medications":[{"name":"","dose":"","timesPerDay":1,"times":["08:00"],"withFood":"with|without|any","durationDays":null,"instructions":"","plainLanguage":"","source":"page N","sourceQuote":"exact words from the document"}],
 "appointments":[{"title":"","date":"YYYY-MM-DD","time":"HH:MM","location":"","prep":"","source":"page N","sourceQuote":"exact words from the document"}],
 "diet":[{"rule":"","plainLanguage":"","source":"page N","sourceQuote":"exact words from the document"}],
 "activity":[{"rule":"","plainLanguage":"","source":"page N","sourceQuote":"exact words from the document"}],
 "exercises":[{"name":"","frequency":"","source":"page N","sourceQuote":"exact words from the document"}],
 "redFlags":[{"symptom":"","keywords":["fever"],"source":"page N","sourceQuote":"exact words from the document"}]
}
Only include what is written in the document. For every item, sourceQuote must be the exact, verbatim text it came from. Never invent or give medical advice. Use null/empty when unknown.`;

app.post("/api/extract", rateLimit, upload.single("file"), async (req, res) => {
  if (req.query.demo || !HAS_AI()) return res.json({ demo: true, plan: samplePlan() });
  try {
    const f = req.file;
    if (!f) return res.status(400).json({ error: "No file uploaded" });
    if (!ALLOWED.has(f.mimetype)) return res.status(400).json({ error: "Please upload a PDF or a JPG/PNG photo." });
    const text = await askModel({ prompt: PROMPT, file: f });
    const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    res.json({ demo: false, plan: json });
  } catch (e) {
    console.error(e.message);
    const busy = /timeout|abort|overload|high demand|unavailable|quota|429|503/i.test(e.message);
    res.status(busy ? 503 : 500).json({ error: busy
      ? "The AI reader is busy right now. Please try again in a minute, or tap \"Try with sample papers\" to see the full app."
      : "Could not read this document. Try a clearer photo or a PDF." });
  }
});

app.use(express.json());
app.post("/api/meals", rateLimit, async (req, res) => {
  const rules = (req.body.rules || []).slice(0, 10);
  const fallback = { meals: [
    { day: "Day 1", breakfast: "Oatmeal with berries (no added salt)", lunch: "Grilled chicken salad, olive oil and lemon", dinner: "Baked salmon, steamed broccoli, brown rice", grocery: ["oats", "berries", "chicken breast", "salmon", "broccoli"] },
    { day: "Day 2", breakfast: "Plain yogurt with banana", lunch: "Lentil soup (homemade, low sodium)", dinner: "Turkey and vegetable stir-fry", grocery: ["yogurt", "lentils", "turkey", "mixed vegetables"] } ] };
  if (!HAS_AI()) return res.json({ demo: true, ...fallback });
  try {
    const t = await askModel({ max: 2000, prompt:
      `Diet rules from a patient's discharge papers: ${JSON.stringify(rules)}. Suggest a 3-day sample meal plan that follows them strictly. Return ONLY JSON: {"meals":[{"day":"","breakfast":"","lunch":"","dinner":"","grocery":[""]}]}. These are suggestions only; do not give medical advice.` });
    res.json({ demo: false, ...JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1)) });
  } catch (e) { console.error(e.message); res.json({ demo: true, ...fallback }); }
});

const SAFE = "Please ask your care team (call your doctor or nurse) about that. I can only repeat what is in your discharge papers.";
function fallbackAnswer(q, plan) {
  q = q.toLowerCase(); const out = [];
  // Never answer questions about changing/combining/missing doses: that's medical advice.
  if (/double|extra|skip|stop|quit|increase|decrease|more|less|instead|miss|forgot|missed|safe|mix|together|alcohol|pregnan|allerg|side effect|overdose|crush|split/.test(q)) return SAFE;
  const L = (a, f) => (a || []).map(f).join("\n");
  if (/pill|dose|medic|take|drug|when/.test(q)) out.push("Your medications:\n" + L(plan.medications, m => `• ${m.name} ${m.dose || ""} at ${(m.times || []).join(", ")}${m.durationDays ? " for " + m.durationDays + " days" : ""}${m.withFood === "with" ? " (with food)" : ""}`));
  if (/appoint|doctor|visit|follow|therapy|where/.test(q)) out.push("Your appointments:\n" + L(plan.appointments, a => `• ${a.title}: ${a.date} ${a.time}, ${a.location}${a.prep ? ". " + a.prep : ""}`));
  if (/lift|activity|exercise|walk|drive|work|carry/.test(q)) out.push("Activity limits from your papers:\n" + L(plan.activity, a => `• ${a.rule}`) + (plan.exercises?.length ? "\n" + L(plan.exercises, e => `• ${e.name}: ${e.frequency}`) : ""));
  if (/eat|diet|food|salt|drink/.test(q)) out.push("Diet rules from your papers:\n" + L(plan.diet, d => `• ${d.rule}`));
  if (/fever|pain|bleed|swell|symptom|warning|emergency|worse|chest/.test(q)) out.push("Warning signs listed in your papers. Contact your doctor if you notice:\n" + L(plan.redFlags, r => `• ${r.symptom}`) + "\nIf it is an emergency, call 911.");
  return out.length ? out.join("\n\n") : SAFE;
}
app.post("/api/chat", rateLimit, async (req, res) => {
  const { question, plan, now } = req.body || {};
  if (!question || !plan) return res.status(400).json({ error: "Missing question or plan" });
  const q = String(question).slice(0, 500), planStr = JSON.stringify(plan).slice(0, 20000);
  if (!HAS_AI()) return res.json({ demo: true, answer: fallbackAnswer(q, plan) });
  try {
    const answer = await askModel({ json: false, max: 700, prompt:
      `You are a reminder assistant for a patient. Current time: ${now || "unknown"}.
Answer ONLY using the confirmed discharge plan below. Use simple, short, kind language (patient may be elderly).
Rules: never give your own medical advice, never suggest changing, skipping or adding any medication or dose, never diagnose. If the plan does not answer it, say: "${SAFE}" If the question suggests a warning sign from the plan, tell them to contact their doctor (911 for emergencies).
PLAN: ${planStr}
QUESTION: ${q}` });
    res.json({ demo: false, answer });
  } catch (e) { console.error(e.message); res.json({ demo: true, answer: fallbackAnswer(q, plan) }); }
});

function samplePlan() {
  const d = n => { const t = new Date(); t.setDate(t.getDate() + n); return t.toISOString().slice(0, 10); };
  return {
    medications: [
      { name: "Lisinopril", dose: "10 mg", timesPerDay: 1, times: ["08:00"], withFood: "any", durationDays: null, instructions: "Take 1 tablet by mouth daily for hypertension", sourceQuote: "Lisinopril 10 mg: Take 1 tablet by mouth daily for hypertension", plainLanguage: "Blood pressure pill. One each morning.", source: "page 1" },
      { name: "Metformin", dose: "500 mg", timesPerDay: 2, times: ["08:00", "20:00"], withFood: "with", durationDays: null, instructions: "Take 1 tablet BID with meals", sourceQuote: "Metformin 500 mg: Take 1 tablet BID with meals", plainLanguage: "Diabetes pill. Morning and evening, with food.", source: "page 1" },
      { name: "Amoxicillin", dose: "500 mg", timesPerDay: 3, times: ["08:00", "14:00", "22:00"], withFood: "any", durationDays: 7, instructions: "Take 1 capsule TID x 7 days", sourceQuote: "Amoxicillin 500 mg: Take 1 capsule TID x 7 days", plainLanguage: "Antibiotic. Three times a day for 7 days, then stop.", source: "page 2" },
    ],
    appointments: [
      { title: "Cardiology follow-up", date: d(7), time: "10:30", location: "NYU Langone, 550 First Ave", prep: "Bring medication list. Do not eat after midnight.", source: "page 3", sourceQuote: "Cardiology follow-up in 1 week. NPO after midnight. Bring med list." },
      { title: "Physical therapy", date: d(3), time: "14:00", location: "Tandon PT Clinic", prep: "Wear loose clothing.", source: "page 3" },
    ],
    diet: [{ sourceQuote: "Diet: sodium restriction < 2g/day", rule: "Sodium restriction < 2g/day", plainLanguage: "Eat low-salt foods. Avoid canned soups and chips.", source: "page 2" }],
    activity: [{ sourceQuote: "No lifting > 10 lbs x 6 weeks", rule: "No lifting > 10 lbs x 6 weeks", plainLanguage: "Do not lift anything heavier than a gallon of milk for 6 weeks.", source: "page 2" }],
    exercises: [{ name: "Ankle pumps", frequency: "10 reps, 3x daily", source: "page 3" }],
    redFlags: [
      { sourceQuote: "Call your doctor for fever over 101°F", symptom: "Fever over 101°F", keywords: ["fever", "chills"], source: "page 4" },
      { symptom: "Chest pain or shortness of breath", keywords: ["chest pain", "short of breath", "breathless"], source: "page 4" },
      { symptom: "Bleeding or swelling at incision", keywords: ["bleeding", "swelling", "pus"], source: "page 4" },
    ],
  };
}

const port = process.env.PORT || 3000;
app.use((err, _req, res, _next) => res.status(400).json({ error: err.code === "LIMIT_FILE_SIZE" ? "File too large (max 20 MB)." : "Upload failed." }));
app.listen(port, () => console.log(`http://localhost:${port}`));
