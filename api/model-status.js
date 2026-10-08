// 3D üretiminin durumunu Meshy'den okur. Bittiğinde dosyaları kendi depomuza kopyalar,
// çünkü Meshy'nin verdiği adresler süreli; model tekrar kullanılabilir kalmalı.
const { configured, send, userOf, db, putObject, UUID } = require("./_lib");
const { advanceToon } = require("./_toon");

const MAX_BYTES = 45 * 1024 * 1024;

async function copy(url, bucketPath, type) {
  const r = await fetch(url);
  if (!r.ok) throw new Error("download " + r.status);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > MAX_BYTES) throw new Error("too_large");
  await putObject("car-models", bucketPath, buf, type);
  return bucketPath;
}

module.exports = async (req, res) => {
  if (req.method !== "GET") return send(res, 405, { error: "method" });
  if (!configured()) return send(res, 503, { error: "server_not_configured" });
  try {
    const user = await userOf(req);
    if (!user) return send(res, 401, { error: "auth" });
    const carId = (req.query && req.query.carId) || new URL(req.url, "http://x").searchParams.get("carId");
    if (!UUID.test(carId || "")) return send(res, 400, { error: "car" });

    const rows = await db("cars?id=eq." + carId + "&owner_id=eq." + user.id + "&select=*");
    let car = rows && rows[0];
    if (!car) return send(res, 404, { error: "car" });
    const pending = car.model_status === "queued" || car.model_status === "processing";
    if (!pending || !car.model_task_id || !process.env.MESHY_API_KEY) return send(res, 200, { car });
    if (car.model_provider === "toon") return send(res, 200, { car: await advanceToon(car) });

    const r = await fetch("https://api.meshy.ai/openapi/v1/multi-image-to-3d/" + encodeURIComponent(car.model_task_id), {
      headers: { Authorization: "Bearer " + process.env.MESHY_API_KEY },
    });
    const t = await r.json().catch(() => ({}));
    if (!r.ok) {
      console.error("meshy get", r.status, JSON.stringify(t).slice(0, 300));
      return send(res, 200, { car }); // geçici hata: durum değişmez, istemci yeniden sorar
    }

    let patch;
    if (t.status === "SUCCEEDED" && t.model_urls && t.model_urls.glb) {
      const base = car.owner_id + "/" + car.id + "/";
      try {
        const glb = await copy(t.model_urls.glb, base + "model.glb", "model/gltf-binary");
        let usdz = null, thumb = null;
        if (t.model_urls.usdz) usdz = await copy(t.model_urls.usdz, base + "model.usdz", "model/vnd.usdz+zip").catch(() => null);
        if (t.thumbnail_url) thumb = await copy(t.thumbnail_url, base + "thumb.png", "image/png").catch(() => null);
        patch = { model_status: "ready", model_progress: 100, model_glb_path: glb, model_usdz_path: usdz, model_thumb_path: thumb, model_error: null };
      } catch (e) {
        console.error("model copy", e);
        patch = { model_status: "failed", model_error: e.message === "too_large" ? "Model dosyası çok büyük." : "Model dosyası kaydedilemedi." };
      }
    } else if (t.status === "FAILED" || t.status === "CANCELED" || t.status === "SUCCEEDED") {
      patch = { model_status: "failed", model_error: ((t.task_error && t.task_error.message) || "3D üretimi tamamlanamadı.").slice(0, 300) };
    } else {
      const progress = Math.max(0, Math.min(99, parseInt(t.progress, 10) || 0));
      const status = t.status === "IN_PROGRESS" ? "processing" : "queued";
      if (progress === car.model_progress && status === car.model_status) return send(res, 200, { car });
      patch = { model_status: status, model_progress: progress };
    }
    const upd = await db("cars?id=eq." + carId, { method: "PATCH", body: JSON.stringify(patch) });
    return send(res, 200, { car: upd[0] || car });
  } catch (e) {
    console.error("model-status", e);
    return send(res, 500, { error: "model3d_failed" });
  }
};
