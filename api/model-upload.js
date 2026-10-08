// Hazır bir GLB dosyasını (Meshy Playground, Polycam, satın alınmış model vb.) araca eklemek için
// tek kullanımlık yükleme izni verir. Dosya tarayıcıdan doğrudan depoya gider.
const { SB, configured, send, userOf, db, readJson, UUID } = require("./_lib");

module.exports = async (req, res) => {
  if (req.method !== "POST") return send(res, 405, { error: "method" });
  if (!configured()) return send(res, 503, { error: "server_not_configured" });
  try {
    const user = await userOf(req);
    if (!user) return send(res, 401, { error: "auth" });
    const { carId } = await readJson(req);
    if (!UUID.test(carId || "")) return send(res, 400, { error: "car" });
    const rows = await db("cars?id=eq." + carId + "&owner_id=eq." + user.id + "&select=id");
    if (!rows || !rows[0]) return send(res, 404, { error: "car" });

    const path = user.id + "/" + carId + "/upload-" + Date.now() + ".glb";
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const r = await fetch(SB + "/storage/v1/object/upload/sign/car-models/" + path, {
      method: "POST",
      headers: { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json" },
      body: "{}",
    });
    const j = await r.json().catch(() => ({}));
    const token = j.token || (j.url ? new URL(j.url, "http://x").searchParams.get("token") : null);
    if (!r.ok || !token) {
      console.error("sign upload", r.status, JSON.stringify(j).slice(0, 300));
      return send(res, 502, { error: "upload_failed", detail: "Depo " + r.status + ": " + String(j.message || j.error || "").slice(0, 200) });
    }
    return send(res, 200, { path, token });
  } catch (e) {
    console.error("model-upload", e);
    return send(res, 500, { error: "upload_failed", detail: String((e && e.message) || e).slice(0, 200) });
  }
};
