const crypto = require("crypto");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");

const express = require("express");
const multer = require("multer");
const PDFDocument = require("pdfkit");

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const MYMEMORY_MIN_INTERVAL_MS = process.env.MYMEMORY_MIN_INTERVAL_MS
  ? Number(process.env.MYMEMORY_MIN_INTERVAL_MS)
  : 1500;
const MAX_UPLOAD_MB = process.env.MAX_UPLOAD_MB ? Number(process.env.MAX_UPLOAD_MB) : 80;

const STORAGE_DIR = path.join(__dirname, "storage");
const OUTPUT_DIR = path.join(STORAGE_DIR, "outputs");
const JOBS_PATH = path.join(STORAGE_DIR, "jobs.json");

let pdfjsLibPromise = null;
async function getPdfjsLib() {
  if (!pdfjsLibPromise) {
    pdfjsLibPromise = import("pdfjs-dist/legacy/build/pdf.mjs").then((m) => m);
  }
  return pdfjsLibPromise;
}

function ensureStorage() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  if (!fs.existsSync(JOBS_PATH)) fs.writeFileSync(JOBS_PATH, JSON.stringify({ jobs: [] }, null, 2), "utf8");
}

async function writeJobs(data) {
  ensureStorage();
  const tmp = `${JOBS_PATH}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await fsp.rename(tmp, JOBS_PATH);
}

async function readJobs() {
  ensureStorage();
  let raw = "";
  try {
    raw = await fsp.readFile(JOBS_PATH, "utf8");
  } catch {
    const fresh = { jobs: [] };
    await writeJobs(fresh);
    return fresh;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.jobs)) throw new Error("Invalid jobs.json");
    return parsed;
  } catch {
    const fresh = { jobs: [] };
    await writeJobs(fresh);
    return fresh;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function newId() {
  return crypto.randomBytes(16).toString("hex");
}

function safeBaseName(name) {
  const base = path.basename(name || "dosya.pdf");
  return base.replace(/[^\p{L}\p{N}._ -]/gu, "_");
}

function splitToChunks(text, maxChars) {
  const normalized = String(text || "").replace(/\r\n/g, "\n");
  if (normalized.length <= maxChars) return [normalized];

  const parts = [];
  const paragraphs = normalized.split(/\n{2,}/);
  let buf = "";

  for (const p of paragraphs) {
    const candidate = buf ? `${buf}\n\n${p}` : p;
    if (candidate.length <= maxChars) {
      buf = candidate;
      continue;
    }
    if (buf) parts.push(buf);
    if (p.length <= maxChars) {
      buf = p;
      continue;
    }
    let start = 0;
    while (start < p.length) {
      parts.push(p.slice(start, start + maxChars));
      start += maxChars;
    }
    buf = "";
  }

  if (buf) parts.push(buf);
  return parts.filter((x) => x.trim().length > 0);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

let myMemoryQueue = Promise.resolve();
let myMemoryLastAt = 0;

function enqueueMyMemory(task) {
  const run = myMemoryQueue.then(task, task);
  myMemoryQueue = run.catch(() => {});
  return run;
}

async function translateWithMyMemory(text) {
  const url = new URL("https://api.mymemory.translated.net/get");
  url.searchParams.set("q", text);
  url.searchParams.set("langpair", "en|tr");

  const maxAttempts = 10;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const res = await enqueueMyMemory(async () => {
      const wait = Math.max(0, myMemoryLastAt + MYMEMORY_MIN_INTERVAL_MS - Date.now());
      if (wait) await sleep(wait);
      const r = await fetch(url.toString(), { method: "GET" });
      myMemoryLastAt = Date.now();
      return r;
    });

    if (res.status === 429) {
      const backoff = Math.min(45000, 2500 * Math.pow(2, attempt));
      await sleep(backoff);
      continue;
    }

    if (!res.ok) throw new Error(`MyMemory hata: ${res.status} ${res.statusText}`);

    const data = await res.json();
    const status = Number(data?.responseStatus);
    const details = String(data?.responseDetails || "");
    if (status && status !== 200) {
      if (details.toLowerCase().includes("query length limit exceeded")) {
        throw new Error("MYMEMORY_QUERY_LIMIT");
      }
      throw new Error(details || "MyMemory hata.");
    }
    const translated = data?.responseData?.translatedText;
    if (typeof translated !== "string" || translated.trim().length === 0) throw new Error("MyMemory yanıtı boş.");
    return translated;
  }

  throw new Error("MyMemory hata: 429 Too Many Requests (limit). Biraz bekleyip tekrar dene ya da OpenAI seç.");
}

async function translateWithMyMemoryAdaptive(text, depth) {
  const t = String(text || "");
  const trimmed = t.trim();
  if (!trimmed) return "";

  const safeMax = 450;
  if (t.length <= safeMax) {
    try {
      return await translateWithMyMemory(t);
    } catch (e) {
      const msg = String(e?.message || e);
      if (msg.includes("MYMEMORY_QUERY_LIMIT") && t.length > 120 && depth < 8) {
        const mid = Math.floor(t.length / 2);
        const left = t.slice(0, mid);
        const right = t.slice(mid);
        const a = await translateWithMyMemoryAdaptive(left, depth + 1);
        const b = await translateWithMyMemoryAdaptive(right, depth + 1);
        return `${a}\n${b}`.trim();
      }
      throw e;
    }
  }

  const parts = splitToChunks(t, safeMax);
  const out = [];
  for (const p of parts) out.push(await translateWithMyMemoryAdaptive(p, depth + 1));
  return out.join("\n\n").trim();
}

async function translateText(provider, text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return "";

  return translateWithMyMemoryAdaptive(text, 0);
}

async function extractPagesText(pdfBuffer, maxPages) {
  const pdfjsLib = await getPdfjsLib();
  let bytes;
  if (Buffer.isBuffer(pdfBuffer)) {
    bytes = new Uint8Array(pdfBuffer.buffer, pdfBuffer.byteOffset, pdfBuffer.byteLength);
  } else if (pdfBuffer instanceof Uint8Array) {
    bytes = pdfBuffer;
  } else {
    bytes = new Uint8Array(pdfBuffer);
  }

  const loadingTask = pdfjsLib.getDocument({ data: bytes });
  const pdf = await loadingTask.promise;

  const pages = [];
  const pageCount = Math.min(pdf.numPages, maxPages);
  for (let i = 1; i <= pageCount; i += 1) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const strings = (textContent.items || [])
      .map((it) => (typeof it.str === "string" ? it.str : ""))
      .filter((s) => s.length > 0);
    const joined = strings.join(" ").replace(/[ \t]+\n/g, "\n").replace(/[ \t]{2,}/g, " ").trim();
    pages.push(joined);
  }

  return { pages, totalPages: pdf.numPages };
}

async function writeTranslatedPdf({ pagesTr, outputPath, title }) {
  ensureStorage();
  await fsp.mkdir(path.dirname(outputPath), { recursive: true });

  await new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 54, left: 54, right: 54, bottom: 54 },
      info: { Title: title }
    });
    const stream = fs.createWriteStream(outputPath);
    stream.on("error", reject);
    doc.on("error", reject);
    doc.pipe(stream);

    doc.font("Helvetica").fontSize(11);
    for (let i = 0; i < pagesTr.length; i += 1) {
      if (i !== 0) doc.addPage();
      const body = pagesTr[i] || "";
      doc.text(body, { width: 495, align: "left" });
    }
    doc.end();
    stream.on("finish", resolve);
  });
}

async function updateJob(id, patch) {
  const data = await readJobs();
  const idx = data.jobs.findIndex((j) => j.id === id);
  if (idx === -1) return null;
  const next = { ...data.jobs[idx], ...patch, updatedAt: nowIso() };
  data.jobs[idx] = next;
  await writeJobs(data);
  return next;
}

async function getJob(id) {
  const data = await readJobs();
  return data.jobs.find((j) => j.id === id) || null;
}

async function runTranslationJob({ id, inputBuffer, provider, originalName }) {
  try {
    await updateJob(id, { status: "processing", progress: { stage: "extract", current: 0, total: 0 } });

    const { pages, totalPages } = await extractPagesText(inputBuffer, 30);
    const maxChars = 450;
    const pageChunks = pages.map((p) => splitToChunks(p || "", maxChars));
    const totalChunks = pageChunks.reduce((acc, arr) => acc + arr.length, 0);
    await updateJob(id, {
      progress: { stage: "translate", current: 0, total: Math.max(1, totalChunks) },
      meta: { totalPages, processedPages: pages.length }
    });

    const pagesTr = [];
    let doneChunks = 0;
    for (let i = 0; i < pageChunks.length; i += 1) {
      const chunks = pageChunks[i] || [];
      const translatedChunks = [];
      for (const chunk of chunks) {
        const out = await translateText(provider, chunk);
        translatedChunks.push(out);
        doneChunks += 1;
        await updateJob(id, { progress: { stage: "translate", current: doneChunks, total: Math.max(1, totalChunks) } });
      }
      pagesTr.push(translatedChunks.join("\n\n").trim());
    }

    await updateJob(id, { progress: { stage: "pdf", current: 0, total: 1 } });
    const outputPath = path.join(OUTPUT_DIR, `${id}.pdf`);
    const title = `TR - ${originalName}`;
    await writeTranslatedPdf({ pagesTr, outputPath, title });

    await updateJob(id, { status: "done", outputPath, progress: { stage: "done", current: 1, total: 1 } });
  } catch (e) {
    await updateJob(id, { status: "error", error: String(e?.message || e) });
  }
}

ensureStorage();

const app = express();
app.disable("x-powered-by");
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json({ limit: "1mb" }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: Math.max(1, MAX_UPLOAD_MB) * 1024 * 1024 }
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.get("/api/job/:id", async (req, res) => {
  const job = await getJob(req.params.id);
  if (!job) return res.status(404).json({ error: "Bulunamadı." });
  res.json({
    id: job.id,
    originalName: job.originalName,
    provider: job.provider,
    status: job.status,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    progress: job.progress || null,
    error: job.error || null,
    canDownload: job.status === "done"
  });
});

app.get("/api/download/:id", async (req, res) => {
  const job = await getJob(req.params.id);
  if (!job) return res.status(404).json({ error: "Bulunamadı." });
  if (job.status !== "done" || !job.outputPath) return res.status(409).json({ error: "PDF hazır değil." });
  const outPath = String(job.outputPath);
  if (!fs.existsSync(outPath)) return res.status(410).json({ error: "Dosya bulunamadı." });
  const downloadName = `${path.parse(job.originalName || "ceviri").name}-TR.pdf`;
  res.download(outPath, safeBaseName(downloadName));
});

app.post("/api/translate", upload.single("pdf"), async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: "PDF yüklenmedi." });
  const contentType = String(file.mimetype || "");
  if (!contentType.includes("pdf")) return res.status(400).json({ error: "Sadece PDF desteklenir." });

  const provider = "free";

  const id = newId();
  const originalName = safeBaseName(file.originalname);
  const createdAt = nowIso();

  const data = await readJobs();
  data.jobs.push({
    id,
    originalName,
    provider,
    status: "queued",
    createdAt,
    updatedAt: createdAt,
    progress: { stage: "queued", current: 0, total: 0 }
  });
  await writeJobs(data);

  setImmediate(() => {
    runTranslationJob({ id, inputBuffer: file.buffer, provider, originalName });
  });

  res.json({ id });
});

app.use((err, req, res, next) => {
  const name = err && err.name ? String(err.name) : "";
  const code = err && err.code ? String(err.code) : "";
  if (name === "MulterError" || code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: `Dosya çok büyük. Sunucu limiti: ${Math.max(1, MAX_UPLOAD_MB)}MB` });
  }
  const msg = err && err.message ? String(err.message) : "Sunucu hatası";
  return res.status(500).json({ error: msg });
});

function logStartup(port) {
  console.log(`Server: http://localhost:${port}`);
  console.log("Çeviri: ücretsiz (MyMemory)");
}

function listenWithFallback(port, remaining) {
  const server = app.listen(port, () => logStartup(port));
  server.on("error", (err) => {
    if (err && err.code === "EADDRINUSE" && remaining > 0) {
      listenWithFallback(port + 1, remaining - 1);
      return;
    }
    const code = err && err.code ? String(err.code) : "UNKNOWN";
    const message = err && err.message ? String(err.message) : String(err || "Sunucu hatası");
    console.error(`Server hata: ${code} - ${message}`);
    process.exitCode = 1;
  });
}

listenWithFallback(PORT, 10);

