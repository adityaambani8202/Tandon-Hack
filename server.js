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
async function askModel({ prompt, file, max = 4096 }) {
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
  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
  const parts = [];
  if (file) parts.push({ inline_data: { mime_type: file.mimetype, data: file.buffer.toString("base64") } });
  parts.push({ text: prompt });
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
    body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseMimeType: "application/json", maxOutputTokens: max } }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error?.message || "Gemini request failed");
  return (j.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("");
}

const PROMPT = `You extract structured data from hospital discharge paperwork. Return ONLY valid JSON, no prose:
{
 "medications":[{"name":"","dose":"","timesPerDay":1,"times":["08:00"],"withFood":"with|without|any","durationDays":null,"instructions":"","plainLanguage":"","source":"page N"}],
 "appointments":[{"title":"","date":"YYYY-MM-DD","time":"HH:MM","location":"","prep":"","source":"page N"}],
 "diet":[{"rule":"","plainLanguage":"","source":"page N"}],
 "activity":[{"rule":"","plainLanguage":"","source":"page N"}],
 "exercises":[{"name":"","frequency":"","source":"page N"}],
 "redFlags":[{"symptom":"","keywords":["fever"],"source":"page N"}]
}
Only include what is written in the document. Never invent or give medical advice. Use null/empty when unknown.`;

app.post("/api/extract", rateLimit, upload.single("file"), async (req, res) => {
  if (!HAS_AI()) return res.json({ demo: true, plan: samplePlan() });
  try {
    const f = req.file;
    if (!f) return res.status(400).json({ error: "No file uploaded" });
    if (!ALLOWED.has(f.mimetype)) return res.status(400).json({ error: "Please upload a PDF or a JPG/PNG photo." });
    const text = await askModel({ prompt: PROMPT, file: f });
    const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    res.json({ demo: false, plan: json });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not read document: " + e.message });
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
  } catch (e) { res.status(500).json({ error: e.message }); }
});

function samplePlan() {
  const d = n => { const t = new Date(); t.setDate(t.getDate() + n); return t.toISOString().slice(0, 10); };
  return {
    medications: [
      { name: "Lisinopril", dose: "10 mg", timesPerDay: 1, times: ["08:00"], withFood: "any", durationDays: null, instructions: "Take 1 tablet by mouth daily for hypertension", plainLanguage: "Blood pressure pill. One each morning.", source: "page 1" },
      { name: "Metformin", dose: "500 mg", timesPerDay: 2, times: ["08:00", "20:00"], withFood: "with", durationDays: null, instructions: "Take 1 tablet BID with meals", plainLanguage: "Diabetes pill. Morning and evening, with food.", source: "page 1" },
      { name: "Amoxicillin", dose: "500 mg", timesPerDay: 3, times: ["08:00", "14:00", "22:00"], withFood: "any", durationDays: 7, instructions: "Take 1 capsule TID x 7 days", plainLanguage: "Antibiotic. Three times a day for 7 days, then stop.", source: "page 2" },
    ],
    appointments: [
      { title: "Cardiology follow-up", date: d(7), time: "10:30", location: "NYU Langone, 550 First Ave", prep: "Bring medication list. Do not eat after midnight.", source: "page 3" },
      { title: "Physical therapy", date: d(3), time: "14:00", location: "Tandon PT Clinic", prep: "Wear loose clothing.", source: "page 3" },
    ],
    diet: [{ rule: "Sodium restriction < 2g/day", plainLanguage: "Eat low-salt foods. Avoid canned soups and chips.", source: "page 2" }],
    activity: [{ rule: "No lifting > 10 lbs x 6 weeks", plainLanguage: "Do not lift anything heavier than a gallon of milk for 6 weeks.", source: "page 2" }],
    exercises: [{ name: "Ankle pumps", frequency: "10 reps, 3x daily", source: "page 3" }],
    redFlags: [
      { symptom: "Fever over 101°F", keywords: ["fever", "chills"], source: "page 4" },
      { symptom: "Chest pain or shortness of breath", keywords: ["chest pain", "short of breath", "breathless"], source: "page 4" },
      { symptom: "Bleeding or swelling at incision", keywords: ["bleeding", "swelling", "pus"], source: "page 4" },
    ],
  };
}

const port = process.env.PORT || 3000;
app.use((err, _req, res, _next) => res.status(400).json({ error: err.code === "LIMIT_FILE_SIZE" ? "File too large (max 20 MB)." : "Upload failed." }));
app.listen(port, () => console.log(`http://localhost:${port}`));
