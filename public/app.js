const $ = (sel) => document.querySelector(sel);

const badge = $("#badge");
const limits = $("#limits");
const healthLine = $("#healthLine");
const drop = $("#drop");
const pdfInput = $("#pdf");
const fileName = $("#fileName");
const provider = $("#provider");
const go = $("#go");

const status = $("#status");
const stage = $("#stage");
const detail = $("#detail");
const barIn = $("#barIn");
const actions = $("#actions");

let pollTimer = null;

function setStatus({ show, stageText, detailText, pct }) {
  status.hidden = !show;
  if (stageText) stage.textContent = stageText;
  detail.textContent = detailText || "";
  const safe = Number.isFinite(pct) ? Math.max(0, Math.min(100, pct)) : 0;
  barIn.style.width = `${safe}%`;
}

function clearActions() {
  actions.innerHTML = "";
}

function addAction({ href, text }) {
  const a = document.createElement("a");
  a.href = href;
  a.textContent = text;
  a.rel = "noopener";
  actions.appendChild(a);
}

async function apiGet(url) {
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

async function apiPostForm(url, formData) {
  const res = await fetch(url, { method: "POST", body: formData });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

function jobStageLabel(s) {
  if (s === "queued") return "Sırada";
  if (s === "extract") return "Metin çıkarılıyor";
  if (s === "translate") return "Çevriliyor";
  if (s === "pdf") return "PDF hazırlanıyor";
  if (s === "done") return "Hazır";
  if (s === "processing") return "İşleniyor";
  return "İşleniyor";
}

async function checkHealth() {
  try {
    await apiGet("/api/health");
    provider.value = "free";
    provider.disabled = true;
    badge.textContent = "OpenAI kapalı";
    badge.style.borderColor = "rgba(255,255,255,.12)";
  } catch {
    badge.textContent = "Sunucu kapalı";
  }
}

function setFileLabel() {
  const f = pdfInput.files && pdfInput.files[0];
  fileName.textContent = f ? f.name : "PDF seç veya sürükle-bırak";
}

function setupDragDrop() {
  const prevent = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  ["dragenter", "dragover", "dragleave", "drop"].forEach((ev) => {
    drop.addEventListener(ev, prevent);
  });

  ["dragenter", "dragover"].forEach((ev) => {
    drop.addEventListener(ev, () => drop.classList.add("drag"));
  });

  ["dragleave", "drop"].forEach((ev) => {
    drop.addEventListener(ev, () => drop.classList.remove("drag"));
  });

  drop.addEventListener("drop", (e) => {
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;
    pdfInput.files = files;
    setFileLabel();
  });
}

async function pollJob(id) {
  clearActions();
  if (pollTimer) window.clearInterval(pollTimer);

  const tick = async () => {
    const j = await apiGet(`/api/job/${encodeURIComponent(id)}`);
    if (j.status === "error") {
      setStatus({ show: true, stageText: "Hata", detailText: j.error || "Bilinmeyen hata", pct: 100 });
      clearActions();
      window.clearInterval(pollTimer);
      pollTimer = null;
      return;
    }

    if (j.status === "done") {
      setStatus({ show: true, stageText: "Hazır", detailText: "Çeviri tamamlandı", pct: 100 });
      clearActions();
      addAction({ href: `/api/download/${encodeURIComponent(id)}`, text: "PDF’i indir" });
      window.clearInterval(pollTimer);
      pollTimer = null;
      return;
    }

    const p = j.progress || {};
    const st = p.stage || j.status;
    const cur = Number(p.current || 0);
    const tot = Number(p.total || 0);
    const pct = tot > 0 ? Math.round((cur / tot) * 100) : 10;
    const d = j.originalName ? j.originalName : "";
    setStatus({ show: true, stageText: jobStageLabel(st), detailText: d, pct });
  };

  await tick();
  pollTimer = window.setInterval(tick, 1200);
}

async function translate() {
  const f = pdfInput.files && pdfInput.files[0];
  if (!f) {
    setStatus({ show: true, stageText: "Uyarı", detailText: "Lütfen bir PDF seç.", pct: 0 });
    return;
  }

  go.disabled = true;
  clearActions();
  setStatus({ show: true, stageText: "Gönderiliyor", detailText: "PDF yükleniyor…", pct: 6 });

  const fd = new FormData();
  fd.append("pdf", f);
  fd.append("provider", provider.value);

  try {
    const { id } = await apiPostForm("/api/translate", fd);
    await pollJob(id);
  } catch (e) {
    setStatus({ show: true, stageText: "Hata", detailText: String(e?.message || e), pct: 0 });
  } finally {
    go.disabled = false;
  }
}

pdfInput.addEventListener("change", setFileLabel);
go.addEventListener("click", translate);

setupDragDrop();
setFileLabel();
checkHealth().catch(() => {});

limits.textContent = "Büyük dosyalar desteklenir (sunucu limitine bağlı).";
healthLine.textContent = `${location.origin}/api/health`;
