// 3D üretimi başlatır: aracın fotoğraflarını Meshy'nin çok görselli image-to-3D servisine gönderir.
// Belgeler: https://docs.meshy.ai/en/api/multi-image-to-3d
const { configured, send, userOf, db, signUrl, ownPath, readJson, UUID } = require("./_lib");

// Meshy en fazla 4 görsel alır ve ilk görseli ön görünüm sayar.
const ORDER = ["front", "left", "right", "rear", "frontq", "rearq"];
function pickPhotos(paths) {
  const slot = (p) => (p.split("/").pop() || "").replace(/\.[a-z]+$/i, "");
  const sorted = paths.slice().sort((a, b) => {
    const ia = ORDER.indexOf(slot(a)), ib = ORDER.indexOf(slot(b));
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  // Ön, bir yan, arka ve bir çapraz: sol ve sağ aynı bilgiyi taşıdığı için yalnızca biri alınır.
  const out = [];
  let side = false;
  for (const p of sorted) {
    const s = slot(p);
    if (s === "left" || s === "right") { if (side) continue; side = true; }
    out.push(p);
    if (out.length === 4) break;
  }
  return out;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return send(res, 405, { error: "method" });
  if (!configured()) return send(res, 503, { error: "server_not_configured" });
  if (!process.env.MESHY_API_KEY) return send(res, 503, { error: "model3d_not_configured" });
  try {
    const user = await userOf(req);
    if (!user) return send(res, 401, { error: "auth" });
    const { carId } = await readJson(req);
    if (!UUID.test(carId || "")) return send(res, 400, { error: "car" });

    const rows = await db("cars?id=eq." + carId + "&owner_id=eq." + user.id + "&select=*");
    const car = rows && rows[0];
    if (!car) return send(res, 404, { error: "car" });
    if (!car.user_confirmed) return send(res, 400, { error: "not_confirmed" });
    if (car.model_status === "queued" || car.model_status === "processing") return send(res, 200, { car });

    // Kredi koruması: kullanıcı başına günlük üretim sınırı.
    const limit = parseInt(process.env.MODEL_DAILY_LIMIT || "3", 10);
    const since = new Date(Date.now() - 864e5).toISOString();
    const recent = await db("cars?owner_id=eq." + user.id + "&model_requested_at=gte." + encodeURIComponent(since) + "&select=id");
    if (recent.length >= limit) return send(res, 429, { error: "daily_limit", limit });

    const photos = pickPhotos((car.photo_paths || []).filter((p) => ownPath(user.id, p)));
    if (!photos.length) return send(res, 400, { error: "no_photos" });
    const image_urls = await Promise.all(photos.map((p) => signUrl("car-photos", p, 3600)));

    const r = await fetch("https://api.meshy.ai/openapi/v1/multi-image-to-3d", {
      method: "POST",
      headers: { Authorization: "Bearer " + process.env.MESHY_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        image_urls,
        ai_model: process.env.MESHY_MODEL || "latest",
        should_texture: true,
        enable_pbr: true,
        should_remesh: true,
        target_polycount: 60000, // telefonlarda akıcı kalması için
        target_formats: ["glb", "usdz"], // usdz: iPhone'da AR
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.result) {
      console.error("meshy create", r.status, JSON.stringify(j).slice(0, 400));
      const error = r.status === 402 ? "model3d_no_credits" : r.status === 401 ? "model3d_bad_key" : r.status === 429 ? "rate_limited" : "model3d_failed";
      return send(res, r.status === 402 || r.status === 429 ? r.status : 502, { error });
    }

    const upd = await db("cars?id=eq." + carId, {
      method: "PATCH",
      body: JSON.stringify({
        model_status: "queued", model_provider: "meshy", model_task_id: j.result, model_progress: 0,
        model_error: null, model_requested_at: new Date().toISOString(),
      }),
    });
    return send(res, 200, { car: upd[0] });
  } catch (e) {
    console.error("model-start", e);
    return send(res, 500, { error: "model3d_failed" });
  }
};
module.exports.pickPhotos = pickPhotos;
