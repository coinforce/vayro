// Çizgi film tarzı araç çizimleri: aracın fotoğraflarından, Meshy'nin image-to-image servisiyle
// sabit açılarda, arka plansız çıkartma görselleri üretir.
// Belgeler: https://docs.meshy.ai/en/api/image-to-image
// Durum (hangi açı hangi görevde, hangi dosyada) cars.model_task_id içinde JSON olarak tutulur.
const { SB, db, signUrl, putObject, ownPath } = require("./_lib");

const API = "https://api.meshy.ai/openapi/v1/image-to-image";
const auth = () => ({ Authorization: "Bearer " + process.env.MESHY_API_KEY });

const STYLE =
  "Redraw this exact car as a glossy cartoon sticker illustration with chibi, toy-like proportions: shortened body, " +
  "oversized wheels, slightly enlarged cabin. Smooth vector-style shading with soft gradients and bright highlights, clean dark outlines. " +
  "Keep the real car's identity: same make and model shape cues, same body color, same stripes and livery, same wheels, spoiler, lights and vents. " +
  "Only the car: no people, no driver, no passengers, empty seats, dark tinted windows. " +
  "No text, no watermark, no logos or lettering, blank license plate. No ground, no shadow, no scenery, plain empty background. " +
  "One single car, fully inside the frame, centered.";

// slots: o açı için en yararlı fotoğraflar (dosya adları tarama kutularından gelir)
const VIEWS = {
  fq: { slots: ["frontq", "front", "left", "right"], text: "Viewing angle: front three-quarter view from slightly above, the front of the car pointing to the right." },
  l: { slots: ["left", "right", "frontq"], text: "Viewing angle: exact side profile at wheel height, the front of the car pointing to the right." },
  f: { slots: ["front", "frontq"], text: "Viewing angle: straight-on front view, perfectly symmetrical." },
  b: { slots: ["rear", "rearq"], text: "Viewing angle: straight-on rear view, perfectly symmetrical." },
  rq: { slots: ["rearq", "rear", "left", "right"], text: "Viewing angle: rear three-quarter view from slightly above, the rear of the car toward the viewer and pointing to the left." },
  t: { slots: ["frontq", "rearq", "left", "right"], text: "Viewing angle: top-down view from directly above, the front of the car pointing up." },
};
function viewList() {
  const v = (process.env.TOON_VIEWS || "fq,l,f,b,rq,t").split(",").map((s) => s.trim()).filter((k) => VIEWS[k]);
  return ["fq"].concat(v.filter((k) => k !== "fq")).filter((k, i, a) => a.indexOf(k) === i);
}
const slotOf = (p) => (p.split("/").pop() || "").replace(/\.[a-z]+$/i, "");

function promptFor(car, key, hasStyleRef) {
  const clean = (s, n) => String(s || "").replace(/[\r\n]+/g, " ").slice(0, n);
  const who = "The car is a " + clean(car.brand, 40) + " " + clean(car.model, 60) + (car.year ? " (" + clean(car.year, 20) + ")" : "") +
    (car.color_name ? ". Body color: " + clean(car.color_name, 60) : "") + ".";
  const ref = hasStyleRef
    ? " The first reference image is the finished illustration style to match exactly: same proportions, colors, shading and outline weight. The other reference images are photos of the real car; use them for the details visible from this angle."
    : " The reference images are photos of the real car.";
  return STYLE + " " + who + " " + VIEWS[key].text + ref;
}

async function create(car, key, styleUrl) {
  const paths = (car.photo_paths || []).filter((p) => ownPath(car.owner_id, p));
  let pick = VIEWS[key].slots.map((s) => paths.find((p) => slotOf(p) === s)).filter(Boolean).slice(0, styleUrl ? 3 : 4);
  if (!pick.length) pick = paths.slice(0, 3);
  if (!pick.length) return { status: 400, error: "no_photos" };
  const refs = await Promise.all(pick.map((p) => signUrl("car-photos", p, 3600)));
  if (styleUrl) refs.unshift(styleUrl);
  const r = await fetch(API, {
    method: "POST",
    headers: { ...auth(), "Content-Type": "application/json" },
    body: JSON.stringify({
      ai_model: process.env.MESHY_IMAGE_MODEL || "nano-banana-pro",
      prompt: promptFor(car, key, !!styleUrl),
      reference_image_urls: refs.slice(0, 5),
      aspect_ratio: "4:3",
      remove_background: true,
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.result) {
    console.error("meshy image create", key, r.status, JSON.stringify(j).slice(0, 300));
    return { status: r.status, error: r.status === 402 ? "model3d_no_credits" : r.status === 401 ? "model3d_bad_key" : r.status === 429 ? "rate_limited" : "model3d_failed",
      detail: "Meshy " + r.status + ": " + String(j.message || (j.error && j.error.message) || "").slice(0, 200) };
  }
  return { id: j.result };
}

async function startToon(car) {
  const made = await create(car, "fq", null);
  if (!made.id) return made;
  const m = { toon: 1, ts: Date.now(), tasks: { fq: made.id }, views: {}, failed: [] };
  const upd = await db("cars?id=eq." + car.id, {
    method: "PATCH",
    body: JSON.stringify({
      model_status: "queued", model_provider: "toon", model_task_id: JSON.stringify(m), model_progress: 0, model_error: null,
      model_requested_at: new Date().toISOString(), model_glb_path: null, model_usdz_path: null, model_thumb_path: null,
    }),
  });
  return { car: upd[0] };
}

async function advanceToon(car) {
  const save = async (patch) => (await db("cars?id=eq." + car.id, { method: "PATCH", body: JSON.stringify(patch) }))[0] || car;
  let m;
  try { m = JSON.parse(car.model_task_id); } catch (e) { m = null; }
  if (!m || !m.toon || !m.tasks) return save({ model_status: "failed", model_error: "Üretim kaydı okunamadı." });
  m.views = m.views || {}; m.failed = m.failed || [];
  const base = car.owner_id + "/" + car.id + "/toon-" + m.ts + "-";

  const check = async (key) => {
    const r = await fetch(API + "/" + encodeURIComponent(m.tasks[key]), { headers: auth() });
    const t = await r.json().catch(() => ({}));
    if (!r.ok) return { state: "wait" };
    if (t.status === "SUCCEEDED" && Array.isArray(t.image_urls) && t.image_urls[0]) {
      const img = await fetch(t.image_urls[0]);
      if (!img.ok) return { state: "wait" };
      await putObject("car-models", base + key + ".png", Buffer.from(await img.arrayBuffer()), "image/png");
      m.views[key] = base + key + ".png";
      return { state: "done" };
    }
    if (t.status === "FAILED" || t.status === "CANCELED" || t.status === "SUCCEEDED") {
      m.failed.push(key);
      return { state: "failed", message: (t.task_error && t.task_error.message) || "" };
    }
    return { state: "wait" };
  };

  if (!m.views.fq) {
    // 1. aşama: ana çizim (ön çapraz). Diğer açılar bunun stiline göre üretilir.
    const s = await check("fq");
    if (s.state === "failed") return save({ model_status: "failed", model_error: (s.message || "Çizim üretilemedi.").slice(0, 300) });
    if (s.state === "wait") return car;
    // Diğer açıları yalnızca bir istek başlatsın diye durumu atomik olarak devral.
    const claimed = await db("cars?id=eq." + car.id + "&model_status=eq.queued", { method: "PATCH", body: JSON.stringify({ model_status: "processing" }) });
    if (!claimed || !claimed.length) return car;
    const rest = viewList().filter((k) => k !== "fq");
    const styleUrl = SB + "/storage/v1/object/public/car-models/" + m.views.fq;
    const made = await Promise.all(rest.map((k) => create(car, k, styleUrl).catch(() => ({}))));
    rest.forEach((k, i) => { if (made[i] && made[i].id) m.tasks[k] = made[i].id; });
  } else {
    const open = Object.keys(m.tasks).filter((k) => !m.views[k] && !m.failed.includes(k));
    await Promise.all(open.map((k) => check(k).catch(() => null)));
  }

  const all = Object.keys(m.tasks);
  const left = all.filter((k) => !m.views[k] && !m.failed.includes(k));
  const common = { model_task_id: JSON.stringify(m), model_thumb_path: m.views.fq };
  if (!left.length) return save({ ...common, model_status: "ready", model_progress: 100, model_error: null });
  return save({ ...common, model_status: "processing", model_progress: Math.min(99, Math.round((100 * (all.length - left.length)) / all.length)) });
}

module.exports = { startToon, advanceToon, viewList, promptFor, VIEWS };
