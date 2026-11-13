import express from "express";
import multer from "multer";
import Anthropic from "@anthropic-ai/sdk";

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
app.use(express.static("public"));

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

app.post("/api/extract", upload.single("file"), async (req, res) => {
  if (!process.env.ANTHROPIC_API_KEY) return res.json({ demo: true, plan: samplePlan() });
  try {
    const f = req.file;
    if (!f) return res.status(400).json({ error: "No file uploaded" });
    const b64 = f.buffer.toString("base64");
    const block = f.mimetype === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } }
      : { type: "image", source: { type: "base64", media_type: f.mimetype, data: b64 } };
    const client = new Anthropic();
    const msg = await client.messages.create({
      model: "claude-sonnet-5-5",
      max_tokens: 4096,
      messages: [{ role: "user", content: [block, { type: "text", text: PROMPT }] }],
    });
    const text = msg.content.filter(c => c.type === "text").map(c => c.text).join("");
    const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    res.json({ demo: false, plan: json });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not read document: " + e.message });
  }
});

app.use(express.json());
app.post("/api/meals", async (req, res) => {
  const rules = (req.body.rules || []).slice(0, 10);
  const fallback = { meals: [
    { day: "Day 1", breakfast: "Oatmeal with berries (no added salt)", lunch: "Grilled chicken salad, olive oil and lemon", dinner: "Baked salmon, steamed broccoli, brown rice", grocery: ["oats", "berries", "chicken breast", "salmon", "broccoli"] },
    { day: "Day 2", breakfast: "Plain yogurt with banana", lunch: "Lentil soup (homemade, low sodium)", dinner: "Turkey and vegetable stir-fry", grocery: ["yogurt", "lentils", "turkey", "mixed vegetables"] } ] };
  if (!process.env.ANTHROPIC_API_KEY) return res.json({ demo: true, ...fallback });
  try {
    const client = new Anthropic();
    const msg = await client.messages.create({ model: "claude-sonnet-5-5", max_tokens: 2000, messages: [{ role: "user", content:
      `Diet rules from a patient's discharge papers: ${JSON.stringify(rules)}. Suggest a 3-day sample meal plan that follows them strictly. Return ONLY JSON: {"meals":[{"day":"","breakfast":"","lunch":"","dinner":"","grocery":[""]}]}. These are suggestions only; do not give medical advice.` }] });
    const t = msg.content.filter(c => c.type === "text").map(c => c.text).join("");
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
app.listen(port, () => console.log(`http://localhost:${port}`));
