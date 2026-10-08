(function () {
"use strict";
const $ = (id) => document.getElementById(id);
const BODY = { supercar: "Süper spor", sedan: "Sedan", hatchback: "Hatchback", suv: "SUV", coupe: "Coupe", wagon: "Station wagon", pickup: "Pickup", van: "Van / minibüs" };
const SLOTS = [
  { k: "front", t: "Ön", req: 1, p: [50, 8] }, { k: "frontq", t: "Ön çapraz", req: 0, p: [14, 14] }, { k: "left", t: "Sol yan", req: 0, p: [8, 50] },
  { k: "right", t: "Sağ yan", req: 0, p: [92, 50] }, { k: "rearq", t: "Arka çapraz", req: 0, p: [86, 86] }, { k: "rear", t: "Arka", req: 1, p: [50, 92] }];
const ERR = {
  auth: "Oturumun kapanmış. Yeniden giriş yap.",
  server_not_configured: "Sunucu ayarları eksik.",
  recognition_not_configured: "Araç tanıma servisi bağlı değil. Bilgileri elle girebilirsin.",
  recognition_failed: "Tanıma tamamlanamadı. Yeniden dene ya da bilgileri elle gir.",
  recognition_unreadable: "Yapay zekânın yanıtı okunamadı. Yeniden dene.",
  rate_limited: "Şu an çok fazla istek var. Biraz sonra yeniden dene.",
  model3d_not_configured: "3D üretim servisi bağlı değil.",
  model3d_no_credits: "3D üretim servisinde kredi kalmamış.",
  model3d_bad_key: "3D üretim servisinin anahtarı geçersiz.",
  model3d_failed: "3D üretimi başlatılamadı. Biraz sonra yeniden dene.",
  daily_limit: "Bugünkü 3D üretim hakkın doldu. Yarın yeniden deneyebilirsin.",
  no_photos: "Bu araçta 3D üretim için fotoğraf yok.",
  upload_failed: "Model dosyası yüklenemedi.",
};
let toastT;
function toast(m) { const t = $("toast"); t.textContent = m; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 4500); }
const str = (v, n) => (typeof v === "string" ? v.slice(0, n || 200) : "");
const hexOk = (h) => (/^#[0-9a-f]{6}$/i.test(h || "") ? h : "#8a939b");
function pill(t, cls) { const s = document.createElement("span"); s.className = "pill " + (cls || ""); s.textContent = t; return s; }

let cfg = null, sb = null, session = null, uid = null;
let mine = [], pub = [], liked = new Set();
let view = "auth", current = null, pollT = null, stageKey = "";

async function api(path, opt = {}) {
  const r = await fetch(path, { ...opt, headers: { ...(opt.headers || {}), Authorization: "Bearer " + (session ? session.access_token : ""), ...(opt.body ? { "Content-Type": "application/json" } : {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.error || "http_" + r.status); e.code = j.error || "http"; e.detail = j.detail || (j.error ? "" : "Sunucu " + r.status + " yanıtı verdi."); throw e; }
  return j;
}
const pubUrl = (path) => sb.storage.from("car-models").getPublicUrl(path).data.publicUrl;

/* ---------- Veri ---------- */
async function loadMine() {
  const { data, error } = await sb.from("car_feed").select("*").eq("owner_id", uid).order("created_at", { ascending: false });
  if (error) throw error; mine = data || [];
}
async function loadPublic() {
  const { data, error } = await sb.from("car_feed").select("*").eq("visibility", "public").order("like_count", { ascending: false }).order("created_at", { ascending: true }).limit(200);
  if (error) throw error; pub = data || [];
  const l = await sb.from("likes").select("car_id").eq("user_id", uid);
  liked = new Set((l.data || []).map((x) => x.car_id));
}
async function refresh() {
  try { await Promise.all([loadMine(), loadPublic()]); } catch (e) { console.error(e); toast("Veriler okunamadı. Bağlantını kontrol et."); }
  render();
}
const rankOf = (c) => { const i = pub.findIndex((x) => x.id === c.id); return i < 0 ? null : i + 1; };
const isMine = (c) => c.owner_id === uid;
function mergeCar(c) {
  [mine, pub].forEach((list) => { const i = list.findIndex((x) => x.id === c.id); if (i >= 0) list[i] = Object.assign({}, list[i], c); });
  if (current && current.id === c.id) current = Object.assign({}, current, c);
}

/* ---------- Gezinme ---------- */
function go(v) {
  if (!session && v !== "auth") v = "auth";
  view = v; clearInterval(pollT); pollT = null;
  ["auth", "garage", "explore", "scan", "result", "detail"].forEach((n) => ($("v-" + n).hidden = n !== v));
  $("tabs").hidden = v === "auth";
  ["garage", "explore"].forEach((n) => { const b = $("tab-" + n); if (v === n) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
  if (v === "scan") showScan("pick");
  if (v === "garage" || v === "explore") refresh();
  render(); scrollTo(0, 0);
}
document.addEventListener("click", (e) => { const b = e.target.closest("[data-go]"); if (b) go(b.dataset.go); });

function cardEl(c) {
  const b = document.createElement("button"); b.className = "card";
  let shot;
  if (c.model_thumb_path) { shot = document.createElement("img"); shot.className = "shot"; shot.alt = ""; shot.loading = "lazy"; shot.src = pubUrl(c.model_thumb_path); }
  else { shot = document.createElement("div"); shot.className = "shot ph";
    shot.textContent = c.model_status === "queued" || c.model_status === "processing" ? "3D ÜRETİLİYOR %" + (c.model_progress || 0) : c.model_status === "failed" ? "3D ÜRETİLEMEDİ" : c.model_status === "ready" ? "3D MODEL HAZIR" : "3D MODEL YOK"; }
  const m = document.createElement("div"); m.className = "meta";
  const n = document.createElement("div"); n.className = "name"; n.textContent = (str(c.brand, 40) + " " + str(c.model, 60)).trim() || "İsimsiz araç"; m.appendChild(n);
  if (c.nickname) { const p = document.createElement("div"); p.className = "plate"; p.innerHTML = "<b>TR</b><span></span>"; p.lastChild.textContent = str(c.nickname, 24).toUpperCase(); m.appendChild(p); }
  const pl = document.createElement("div"); pl.className = "row"; pl.style.gap = "6px";
  pl.appendChild(pill("AI eşleşmesi", "ok")); if (c.featured) pl.appendChild(pill("Öne çıkan", "low"));
  pl.appendChild(pill(c.visibility === "public" ? "Herkese açık" : "Özel")); m.appendChild(pl);
  const s = document.createElement("div"); s.className = "stats"; const r = rankOf(c);
  s.textContent = "♥ " + (c.like_count || 0) + "   " + (r ? "SIRA #" + r : "SIRA —"); m.appendChild(s);
  b.append(shot, m); b.addEventListener("click", () => openDetail(c)); return b;
}
function render() {
  if (view === "garage") {
    const cars = mine.slice().sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));
    $("gTitle").textContent = cars.length ? cars.length + " araç" : "Araçların";
    const box = $("gCards"); box.textContent = ""; cars.forEach((c) => box.appendChild(cardEl(c)));
    $("gEmpty").hidden = !!cars.length;
  }
  if (view === "explore") {
    const box = $("xCards"); box.textContent = ""; pub.forEach((c) => box.appendChild(cardEl(c)));
    $("xEmpty").hidden = !!pub.length;
  }
}

/* ---------- Tarama ---------- */
const shots = {}; let draftId = null, ai = null;
function buildSlots() {
  const box = $("slots"); box.textContent = "";
  SLOTS.forEach((s) => {
    const l = document.createElement("label"); l.className = "slot"; l.id = "slot-" + s.k;
    l.innerHTML = '<svg viewBox="0 0 100 100" aria-hidden="true"><rect x="36" y="22" width="28" height="56" rx="9" fill="none" stroke="currentColor" stroke-width="3" opacity=".55"/><path d="M40 34h20M40 66h20" stroke="currentColor" stroke-width="3" opacity=".55" fill="none"/><circle r="7" fill="var(--accent)" cx="' + s.p[0] + '" cy="' + s.p[1] + '"/></svg><span></span><em></em>';
    l.querySelector("span").textContent = s.t; l.querySelector("em").textContent = s.req ? "zorunlu" : "";
    const inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*"; inp.setAttribute("capture", "environment"); inp.id = "in-" + s.k;
    inp.addEventListener("change", () => { const f = inp.files && inp.files[0]; if (f) takeShot(s.k, f); });
    l.appendChild(inp); box.appendChild(l);
  });
  scanState();
}
function resetScan() { SLOTS.forEach((s) => delete shots[s.k]); draftId = null; ai = null; buildSlots(); }
function loadImg(file) { return new Promise((res, rej) => { const u = URL.createObjectURL(file), i = new Image(); i.onload = () => { URL.revokeObjectURL(u); res(i); }; i.onerror = () => { URL.revokeObjectURL(u); rej(new Error("img")); }; i.src = u; }); }
function scale(img, max) { const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight)); const c = document.createElement("canvas");
  c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k); c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); return c; }
async function takeShot(k, file) {
  try {
    const img = await loadImg(file), big = scale(img, 1800), small = scale(img, 420);
    const blob = await new Promise((r) => big.toBlob(r, "image/jpeg", 0.88));
    shots[k] = { blob, url: small.toDataURL("image/jpeg", 0.6), path: null };
    const l = $("slot-" + k); l.classList.add("done"); let im = l.querySelector("img"); if (!im) { im = document.createElement("img"); im.alt = ""; l.insertBefore(im, l.firstChild); }
    im.src = shots[k].url; l.querySelector("svg").style.visibility = "hidden"; l.querySelector("em").textContent = "yeniden çek";
  } catch (e) { toast("Bu fotoğraf okunamadı. Başka bir fotoğraf dene."); }
  scanState();
}
const scanOk = () => shots.front && shots.rear && (shots.left || shots.right) && (shots.frontq || shots.rearq);
function scanState() {
  const n = Object.keys(shots).length;
  $("scanCount").textContent = n + " / 6 fotoğraf" + (scanOk() ? "" : " · ön, arka, bir yan, bir çapraz gerekli") + (cfg && !cfg.recognition ? " · AI tanıma bağlı değil" : "");
  $("btnAnalyze").disabled = !scanOk() || !(cfg && cfg.recognition);
}
function showScan(w) { $("scanPick").hidden = w !== "pick"; $("scanRun").hidden = w !== "run"; $("scanErr").hidden = w !== "err"; if (w === "pick") scanState(); }
function step(k) { let passed = true; document.querySelectorAll("#steps li").forEach((li) => { const me = li.dataset.s === k; if (me) passed = false; li.className = me ? "on" : passed ? "ok" : ""; }); }
async function uploadShots() {
  if (!draftId) draftId = crypto.randomUUID();
  for (const s of SLOTS) {
    const sh = shots[s.k]; if (!sh || sh.path) continue;
    const path = uid + "/" + draftId + "/" + s.k + ".jpg";
    const { error } = await sb.storage.from("car-photos").upload(path, sh.blob, { contentType: "image/jpeg", upsert: true });
    if (error) throw Object.assign(new Error("upload"), { code: "upload" });
    sh.path = path;
  }
  return SLOTS.filter((s) => shots[s.k]).map((s) => shots[s.k].path);
}
function scanFail(m) { $("scanErrMsg").textContent = m; showScan("err"); }
async function analyze() {
  showScan("run"); step("up");
  try {
    const paths = await uploadShots();
    step("ai");
    const { result } = await api("/api/recognize", { method: "POST", body: JSON.stringify({ paths }) });
    step("done");
    if (!result || result.is_vehicle === false) return scanFail("Fotoğraflarda bir araç seçilemedi. Aracın tamamı görünecek şekilde, iyi ışıkta yeniden çek.");
    ai = result; openResult();
  } catch (e) {
    scanFail((e.code === "upload" ? "Fotoğraflar yüklenemedi. Bağlantını kontrol edip yeniden dene." : ERR[e.code] || ERR.recognition_failed) + (e.detail ? " Ayrıntı: " + e.detail : e.code ? "" : " Ayrıntı: " + (e.message || "")));
  }
}
$("btnAnalyze").addEventListener("click", analyze);
$("btnRetry").addEventListener("click", () => showScan("pick"));
function manual() { if (!Object.keys(shots).length) { toast("Önce en az bir fotoğraf ekle."); return; } ai = null; openResult(); }
$("btnManual").addEventListener("click", manual); $("btnManual2").addEventListener("click", manual);

/* ---------- Sonuç ve onay ---------- */
const F = ["brand", "model", "year", "bodyType", "colorName", "wheels", "headlights", "distinctive"];
const AIKEY = { brand: "brand", model: "model", year: "year", bodyType: "body_type", colorName: "color_name", wheels: "wheels", headlights: "headlights", distinctive: "distinctive" };
const aiSrc = {};
function openResult() {
  go("result");
  const ph = $("resPhotos"); ph.textContent = ""; SLOTS.forEach((s) => { if (shots[s.k]) { const i = document.createElement("img"); i.src = shots[s.k].url; i.alt = s.t; ph.appendChild(i); } });
  let lowN = 0;
  F.forEach((f) => {
    const box = document.querySelector('.field[data-f="' + f + '"]'), inp = $("f-" + f), lab = box.querySelector("label");
    box.querySelectorAll(".pill,.suggest").forEach((x) => x.remove());
    inp.value = f === "bodyType" ? "sedan" : ""; aiSrc[f] = null;
    const g = ai && ai[AIKEY[f]]; if (!g || typeof g !== "object") return;
    const v = str(String(g.value == null ? "" : g.value), 400).trim(), conf = Math.max(0, Math.min(1, Number(g.confidence) || 0));
    if (!v || (f === "bodyType" && !BODY[v])) return;
    aiSrc[f] = { value: v, confidence: conf };
    if (conf >= 0.6) { inp.value = v; lab.appendChild(pill("AI tahmini %" + Math.round(conf * 100), "ok")); }
    else { lowN++; lab.appendChild(pill("Düşük güven", "low"));
      const b = document.createElement("button"); b.type = "button"; b.className = "suggest"; b.textContent = "AI tahmini: " + (f === "bodyType" ? BODY[v] : v) + " · kullan";
      b.addEventListener("click", () => { inp.value = v; b.remove(); }); box.appendChild(b); }
  });
  $("f-colorHex").value = hexOk(ai && ai.color_hex);
  const need = ai && str(ai.need_more_photos, 300);
  $("resNote").textContent = !ai ? "AI tanıma kullanılmadı. Bilgileri kendin gir."
    : (lowN ? lowN + " alanda yapay zekâ emin değil. O alanlar boş bırakıldı; tahmini kullanmak istersen üstüne dokun. " : "Yapay zekânın tahminleri aşağıda. Yanlış olanı düzelt. ")
      + (ai.same_vehicle === false ? "Fotoğraflar farklı araçlara ait olabilir. " : "") + (need ? "Ek fotoğraf önerisi: " + need : "");
}
$("btnConfirm").addEventListener("click", async () => {
  const v = {}; F.forEach((f) => (v[f] = $("f-" + f).value.trim()));
  if (!v.brand || !v.model) { toast("Marka ve model gerekli."); return; }
  const btn = $("btnConfirm"); btn.disabled = true; btn.textContent = "Garaja ekleniyor…";
  try {
    const paths = await uploadShots();
    const src = {}; F.forEach((f) => { const a = aiSrc[f]; src[f] = !v[f] ? "bos" : a && a.value === v[f] ? "ai_onayli" : "kullanici"; });
    const { data, error } = await sb.from("cars").insert({
      brand: v.brand, model: v.model, year: v.year, body_type: v.bodyType, color_name: v.colorName, color_hex: $("f-colorHex").value,
      wheels: v.wheels, headlights: v.headlights, distinctive: v.distinctive, field_source: src, ai_result: ai, user_confirmed: true,
      photo_paths: paths, featured: mine.length === 0,
    }).select().single();
    if (error) throw error;
    const car = Object.assign({ like_count: 0 }, data); mine.unshift(car); resetScan();
    toast("Araç garajına eklendi."); openDetail(car);
    if (cfg.model3d) startModel(car);
  } catch (e) { console.error(e); toast("Araç kaydedilemedi. Bağlantını kontrol edip yeniden dene."); }
  btn.disabled = false; btn.textContent = "Onayla ve garaja ekle";
});

/* ---------- 3D model ---------- */
async function startModel(car) {
  try { const { car: c } = await api("/api/model-start", { method: "POST", body: JSON.stringify({ carId: car.id }) }); mergeCar(c); }
  catch (e) { toast(ERR[e.code] || ERR.model3d_failed); }
  if (view === "detail" && current && current.id === car.id) { renderStage(); watch(); }
}
const pending = (c) => c.model_status === "queued" || c.model_status === "processing";
function watch() {
  clearInterval(pollT); pollT = null;
  if (!current || !isMine(current) || !pending(current)) return;
  const id = current.id;
  pollT = setInterval(async () => {
    if (view !== "detail" || !current || current.id !== id) { clearInterval(pollT); return; }
    try { const { car } = await api("/api/model-status?carId=" + id); mergeCar(car); renderStage(); if (!pending(current)) { clearInterval(pollT); fillDetail(false); } } catch (e) { /* bir sonraki turda yeniden denenir */ }
  }, 6000);
}
// Sabit bakış açıları: yön, yükseklik ve uzaklık (model-viewer camera-orbit)
const ANGLES = [
  { k: "fq", t: "Ön çapraz", o: "-40deg 76deg 80%" }, { k: "f", t: "Ön", o: "0deg 82deg 80%" },
  { k: "l", t: "Sol yan", o: "-90deg 84deg 88%" }, { k: "r", t: "Sağ yan", o: "90deg 84deg 88%" },
  { k: "rq", t: "Arka çapraz", o: "140deg 76deg 80%" }, { k: "b", t: "Arka", o: "180deg 82deg 80%" },
  { k: "t", t: "Üst", o: "0deg 0deg 95%" }];
function renderStage() {
  const c = current, st = $("detStage"), own = isMine(c);
  const key = c.id + c.model_status + (pending(c) ? c.model_progress : "") + (c.model_glb_path || "");
  if (key === stageKey) return; stageKey = key; st.textContent = "";
  const note = $("detModelNote"); note.textContent = "";
  if (c.model_status === "ready" && c.model_glb_path) {
    const mv = document.createElement("model-viewer");
    mv.setAttribute("src", pubUrl(c.model_glb_path));
    if (c.model_usdz_path) mv.setAttribute("ios-src", pubUrl(c.model_usdz_path));
    if (c.model_thumb_path) mv.setAttribute("poster", pubUrl(c.model_thumb_path));
    mv.setAttribute("alt", (c.brand + " " + c.model).trim() + " 3D modeli");
    mv.setAttribute("ar", ""); // serbest döndürme yok: açılar aşağıdaki sabit listeden seçilir
    mv.setAttribute("ar-modes", "webxr scene-viewer quick-look"); mv.setAttribute("ar-scale", "auto");
    mv.setAttribute("shadow-intensity", "1.5"); mv.setAttribute("shadow-softness", "0.9"); mv.setAttribute("environment-image", "neutral"); mv.setAttribute("exposure", "1.1"); 
    // Aracı ön çaprazdan, göz hizasına yakın ve kutuyu dolduracak şekilde göster.
    mv.setAttribute("camera-orbit", ANGLES[0].o); mv.setAttribute("min-camera-orbit", "auto 0deg 30%"); mv.setAttribute("max-camera-orbit", "auto 90deg 200%");
    mv.setAttribute("field-of-view", "26deg"); mv.setAttribute("min-field-of-view", "10deg"); mv.setAttribute("interpolation-decay", "120");
    mv.setAttribute("interaction-prompt", "none");
    st.appendChild(mv);
    const pick = document.createElement("div"); pick.className = "angles";
    const tog = document.createElement("button"); tog.type = "button"; tog.className = "angle-toggle"; tog.setAttribute("aria-expanded", "false");
    const list = document.createElement("div"); list.className = "angle-list"; list.hidden = true;
    const setAngle = (a) => { mv.setAttribute("camera-orbit", a.o); tog.textContent = "Açı: " + a.t + " ▾"; list.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.k === a.k))); };
    ANGLES.forEach((a) => { const b = document.createElement("button"); b.type = "button"; b.dataset.k = a.k; b.textContent = a.t;
      b.addEventListener("click", () => { setAngle(a); list.hidden = true; tog.setAttribute("aria-expanded", "false"); }); list.appendChild(b); });
    tog.addEventListener("click", () => { list.hidden = !list.hidden; tog.setAttribute("aria-expanded", String(!list.hidden)); });
    setAngle(ANGLES[0]); pick.append(tog, list); st.appendChild(pick);
    note.textContent = (c.model_provider === "upload" ? "Bu model senin yüklediğin dosyadır. " : "Model fotoğraflarından yapay zekâyla üretildi; fotoğrafta görünmeyen kısımlar tahmindir. ") + "Açıyı değiştirmek için sol üstteki kutuya dokun. Cihazın destekliyorsa sağ alttaki AR düğmesiyle aracı zemine yerleştirebilirsin. AR'ı yalnızca araç park hâlindeyken kullan.";
    return;
  }
  const w = document.createElement("div"); w.className = "wait";
  const t = document.createElement("div"); t.style.fontWeight = "600";
  if (pending(c)) {
    t.textContent = c.model_status === "queued" ? "3D model sırada bekliyor" : "3D model üretiliyor %" + (c.model_progress || 0);
    const bar = document.createElement("div"); bar.className = "bar"; const i = document.createElement("i"); i.style.width = Math.max(4, c.model_progress || 0) + "%"; bar.appendChild(i);
    const s = document.createElement("div"); s.className = "small muted"; s.textContent = "Birkaç dakika sürebilir. Sayfayı kapatırsan üretim devam eder; geri döndüğünde bu ekranı aç.";
    w.append(t, bar, s);
  } else if (c.model_status === "failed") {
    t.textContent = "3D model üretilemedi"; const s = document.createElement("div"); s.className = "small muted"; s.textContent = str(c.model_error, 300) || "Bilinmeyen hata."; w.append(t, s);
    if (own && cfg.model3d) { const b = document.createElement("button"); b.className = "primary"; b.textContent = "Yeniden dene"; b.addEventListener("click", () => { b.disabled = true; startModel(c); }); w.appendChild(b); }
  } else {
    t.textContent = "Bu aracın 3D modeli yok"; w.appendChild(t);
    if (own && cfg.model3d) { const b = document.createElement("button"); b.className = "primary"; b.textContent = "3D modeli oluştur"; b.addEventListener("click", () => { b.disabled = true; startModel(c); }); w.appendChild(b); }
    else if (own) { const s = document.createElement("div"); s.className = "small muted"; s.textContent = ERR.model3d_not_configured; w.appendChild(s); }
  }
  st.appendChild(w);
}

async function uploadGlb(file) {
  const c = current;
  if (!/\.glb$/i.test(file.name)) { toast("Yalnızca .glb uzantılı dosya yüklenebilir."); return; }
  if (file.size > 45 * 1024 * 1024) { toast("Dosya 45 MB'tan büyük olamaz."); return; }
  const btn = $("glbLabel"); btn.textContent = "Yükleniyor…";
  try {
    const { path, token } = await api("/api/model-upload", { method: "POST", body: JSON.stringify({ carId: c.id }) });
    const { error } = await sb.storage.from("car-models").uploadToSignedUrl(path, token, file, { contentType: "model/gltf-binary" });
    if (error) throw Object.assign(new Error("upload"), { code: "upload_failed", detail: error.message });
    clearInterval(pollT); pollT = null;
    await patch({ model_status: "ready", model_progress: 100, model_glb_path: path, model_usdz_path: null, model_thumb_path: null, model_provider: "upload", model_task_id: null, model_error: null }, "3D model eklendi.");
    renderStage();
  } catch (e) { toast((ERR[e.code] || ERR.upload_failed) + (e.detail ? " Ayrıntı: " + e.detail : "")); }
  btn.textContent = "GLB dosyası yükle"; $("e-glb").value = "";
}
$("btnRegen").addEventListener("click", async () => { const b = $("btnRegen"); b.disabled = true; stageKey = ""; await startModel(current); b.disabled = false; scrollTo(0, 0); });
$("e-glb").addEventListener("change", (e) => { const f = e.target.files && e.target.files[0]; if (f) uploadGlb(f); });

/* ---------- Araç profili ---------- */
function openDetail(c) {
  current = c; stageKey = ""; go("detail"); fillDetail(true); renderStage(); watch();
  const box = $("detPhotos"); box.textContent = "";
  if (isMine(c) && (c.photo_paths || []).length) {
    sb.storage.from("car-photos").createSignedUrls(c.photo_paths, 3600).then(({ data }) => {
      if (!current || current.id !== c.id) return;
      (data || []).forEach((d) => { if (!d.signedUrl) return; const i = document.createElement("img"); i.src = d.signedUrl; i.alt = "Araç fotoğrafı"; i.loading = "lazy"; box.appendChild(i); });
    });
  }
  if (isMine(c) && pending(c)) api("/api/model-status?carId=" + c.id).then(({ car }) => { mergeCar(car); renderStage(); watch(); }).catch(() => {});
}
function fillDetail(resetForm) {
  const c = current, own = isMine(c);
  $("detPlate").textContent = (str(c.nickname, 24) || "İSİMSİZ").toUpperCase();
  $("detName").textContent = (str(c.brand, 40) + " " + str(c.model, 60)).trim();
  const p = $("detPills"); p.textContent = ""; p.appendChild(pill("AI görsel eşleşmesi", "ok")); p.appendChild(pill("Sahiplik doğrulanmadı"));
  p.appendChild(pill(c.visibility === "public" ? "Herkese açık" : "Özel")); if (c.featured) p.appendChild(pill("Öne çıkan", "low"));
  const r = rankOf(c); $("detStats").textContent = "♥ " + (c.like_count || 0) + " BEĞENİ   " + (r ? "SIRA #" + r + " / " + pub.length : "SIRA — (özel araç)");
  $("detDesc").textContent = str(c.description, 400);
  $("detSpecs").textContent = [c.year && "Yıl: " + str(c.year, 20), BODY[c.body_type], c.color_name && "Renk: " + str(c.color_name, 40), c.wheels && "Jant: " + str(c.wheels, 120),
    c.headlights && "Far: " + str(c.headlights, 160), c.distinctive && str(c.distinctive, 400)].filter(Boolean).join(" · ");
  const mods = $("detMods"); mods.textContent = ""; const list = Array.isArray(c.mods) ? c.mods : [];
  if (!list.length) { const s = document.createElement("span"); s.className = "muted small"; s.textContent = "Eklenmiş parça yok."; mods.appendChild(s); }
  list.forEach((m, i) => { const ch = document.createElement("span"); ch.className = "chip"; ch.textContent = str(m, 60);
    if (own) { const x = document.createElement("button"); x.textContent = "×"; x.setAttribute("aria-label", "Parçayı kaldır");
      x.addEventListener("click", () => patch({ mods: list.filter((_, j) => j !== i) })); ch.appendChild(x); } else ch.style.paddingRight = "12px";
    mods.appendChild(ch); });
  const lb = $("btnLike"); lb.hidden = c.visibility !== "public"; lb.textContent = liked.has(c.id) ? "♥ Beğendin" : "♡ Beğen";
  $("ownerBox").hidden = !own;
  if (own) { $("btnRegen").hidden = !cfg.model3d || pending(c); $("btnFeature").textContent = c.featured ? "Öne çıkarıldı" : "Öne çıkar"; $("btnFeature").disabled = !!c.featured;
    if (resetForm) { $("e-nick").value = c.nickname || ""; $("e-desc").value = c.description || ""; $("e-vis").value = c.visibility; $("delConfirm").hidden = true; } }
}
async function patch(p, ok) {
  try { const { data, error } = await sb.from("cars").update(p).eq("id", current.id).select().single(); if (error) throw error;
    mergeCar(data); if (ok) toast(ok); await loadPublic().catch(() => {}); fillDetail(false); }
  catch (e) { console.error(e); toast("İşlem tamamlanamadı. Yeniden dene."); }
}
$("btnBack").addEventListener("click", () => go(current && !isMine(current) ? "explore" : "garage"));
$("btnLike").addEventListener("click", async () => {
  const c = current, on = liked.has(c.id);
  const q = on ? sb.from("likes").delete().eq("car_id", c.id).eq("user_id", uid) : sb.from("likes").insert({ car_id: c.id });
  const { error } = await q; if (error) { toast("Beğeni kaydedilemedi."); return; }
  await loadPublic().catch(() => {}); const f = pub.find((x) => x.id === c.id); if (f) mergeCar({ id: c.id, like_count: f.like_count }); fillDetail(false);
});
$("btnAddMod").addEventListener("click", () => { const v = $("e-mod").value.trim(); if (!v) return; const l = Array.isArray(current.mods) ? current.mods : [];
  if (l.length >= 20) { toast("En fazla 20 parça eklenebilir."); return; } $("e-mod").value = ""; patch({ mods: l.concat(v) }); });
$("btnSave").addEventListener("click", () => patch({ nickname: $("e-nick").value.trim(), description: $("e-desc").value.trim(), visibility: $("e-vis").value }, "Kaydedildi."));
$("btnFeature").addEventListener("click", async () => {
  const { error } = await sb.from("cars").update({ featured: false }).eq("owner_id", uid).neq("id", current.id);
  if (error) { toast("İşlem tamamlanamadı."); return; }
  mine.forEach((c) => (c.featured = false)); patch({ featured: true }, "Bu araç profilinde öne çıkarıldı.");
});
$("btnDel").addEventListener("click", () => ($("delConfirm").hidden = false));
$("btnDelNo").addEventListener("click", () => ($("delConfirm").hidden = true));
$("btnDelYes").addEventListener("click", async () => {
  const c = current;
  try {
    const { error } = await sb.from("cars").delete().eq("id", c.id); if (error) throw error;
    if ((c.photo_paths || []).length) sb.storage.from("car-photos").remove(c.photo_paths);
    const models = [c.model_glb_path, c.model_usdz_path, c.model_thumb_path].filter(Boolean); if (models.length) sb.storage.from("car-models").remove(models);
    toast("Araç silindi."); go("garage");
  } catch (e) { toast("Silinemedi. Yeniden dene."); }
});

/* ---------- Giriş ---------- */
function authWhy(e) {
  const m = String((e && e.message) || "");
  if (/registered|already/i.test(m)) return "bu e-posta zaten kayıtlı.";
  if (/fetch|network|load failed/i.test(m)) return "Supabase'e ulaşılamadı. Vercel'deki SUPABASE_URL değeri yanlış olabilir.";
  if (/api key|jwt|apikey/i.test(m)) return "Supabase anahtarı geçersiz. Vercel'deki SUPABASE_ANON_KEY değerini kontrol et.";
  if (/rate|too many|seconds/i.test(m)) return "çok fazla deneme yapıldı. Birkaç dakika sonra yeniden dene.";
  if (/password/i.test(m)) return "şifre kabul edilmedi. Daha uzun bir şifre dene.";
  if (/signup|disabled/i.test(m)) return "Supabase'de yeni hesap açma kapalı.";
  return m || "bilinmeyen hata.";
}
function authMsg(m) { const n = $("authMsg"); n.textContent = m; n.hidden = !m; }
$("authForm").addEventListener("submit", async (e) => {
  e.preventDefault(); authMsg("");
  const { error } = await sb.auth.signInWithPassword({ email: $("a-email").value.trim(), password: $("a-pass").value });
  if (error) authMsg(/confirm/i.test(error.message) ? "E-postana gelen onay bağlantısına tıkla, sonra giriş yap." : /invalid login/i.test(error.message) ? "Giriş yapılamadı. E-posta ya da şifre hatalı." : "Giriş yapılamadı: " + authWhy(error));
});
$("btnUp").addEventListener("click", async () => {
  authMsg(""); if (!$("authForm").reportValidity()) return;
  const { data, error } = await sb.auth.signUp({ email: $("a-email").value.trim(), password: $("a-pass").value });
  if (error) authMsg("Hesap oluşturulamadı: " + authWhy(error));
  else if (!data.session) authMsg("Hesabın oluşturuldu. E-postana gelen onay bağlantısına tıkla, sonra giriş yap.");
});
$("btnOut").addEventListener("click", () => sb.auth.signOut());
function onSession(s) {
  const was = uid; session = s; uid = s ? s.user.id : null;
  $("who").textContent = s ? s.user.email : ""; $("btnOut").hidden = !s;
  if (!s) { mine = []; pub = []; go("auth"); } else if (was !== uid) go("garage");
}

/* ---------- Başlat ---------- */
Object.keys(BODY).forEach((k) => { const o = document.createElement("option"); o.value = k; o.textContent = BODY[k]; $("f-bodyType").appendChild(o); });
buildSlots();
(async () => {
  try { cfg = await (await fetch("/api/config")).json(); } catch (e) { cfg = null; }
  if (!cfg || !cfg.ready || !window.supabase) {
    const n = $("setupNote"); n.hidden = false;
    n.textContent = "Sunucu ayarları eksik: Vercel'de SUPABASE_URL, SUPABASE_ANON_KEY ve SUPABASE_SERVICE_ROLE_KEY tanımlı olmalı. Kurulum adımları README dosyasında.";
    return;
  }
  sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  const { data } = await sb.auth.getSession(); onSession(data.session);
  sb.auth.onAuthStateChange((_e, s) => onSession(s));
})();
})();
