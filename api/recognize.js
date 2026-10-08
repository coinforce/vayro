// Araç tanıma: yüklenen fotoğrafları Claude'a gösterir, güven puanlı tahmin döndürür.
// Bu bir görsel eşleştirmedir; sahiplik doğrulamaz ve hiçbir şeyi kaydetmez.
const { configured, send, userOf, signUrl, ownPath, readJson } = require("./_lib");

const PROMPT = `Bu fotoğraflar tek bir otomobilin farklı açılardan çekimleridir. Görsel olarak aracı tanı.
YALNIZCA şu JSON nesnesini döndür, başka metin yazma:
{"is_vehicle":boolean,"same_vehicle":boolean,
"brand":{"value":string,"confidence":number},
"model":{"value":string,"confidence":number},
"year":{"value":string,"confidence":number},
"body_type":{"value":"supercar"|"sedan"|"hatchback"|"suv"|"coupe"|"wagon"|"pickup"|"van","confidence":number},
"color_name":{"value":string,"confidence":number},"color_hex":string,
"headlights":{"value":string,"confidence":number},
"wheels":{"value":string,"confidence":number},
"distinctive":{"value":string,"confidence":number},
"need_more_photos":string}
Kurallar: confidence 0 ile 1 arasında dürüst bir değerdir; emin değilsen düşük ver, uydurma. year için tek yıl yerine kasa neslinin yıl aralığını yaz (örn "2017-2020"). color_hex gövde boyasının yaklaşık #rrggbb değeridir. Metin değerleri Türkçe ve kısa olsun (marka ve model özgün adıyla). Ortadan motorlu alçak süper spor araçlar için "supercar", cabrio için "coupe" kullan. need_more_photos: eksik ya da okunamayan açı varsa hangi fotoğrafın yeniden çekilmesi gerektiğini Türkçe yaz, yoksa boş bırak. Plaka, kişi ya da konum hakkında hiçbir şey yazma. Araç sahipliği hakkında çıkarım yapma.`;

function parseJson(text) {
  try { return JSON.parse(text); } catch (e) {}
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(text.slice(a, b + 1)); } catch (e) {} }
  return null;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return send(res, 405, { error: "method" });
  if (!configured()) return send(res, 503, { error: "server_not_configured" });
  if (!process.env.ANTHROPIC_API_KEY) return send(res, 503, { error: "recognition_not_configured" });
  try {
    const user = await userOf(req);
    if (!user) return send(res, 401, { error: "auth" });
    const body = await readJson(req);
    const paths = Array.isArray(body.paths) ? body.paths.slice(0, 6) : [];
    if (!paths.length || !paths.every((p) => ownPath(user.id, p))) return send(res, 400, { error: "paths" });

    const urls = await Promise.all(paths.map((p) => signUrl("car-photos", p, 600)));
    const content = urls.map((url) => ({ type: "image", source: { type: "url", url } }));
    content.push({ type: "text", text: PROMPT });

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
        max_tokens: 1500,
        messages: [{ role: "user", content }],
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      console.error("anthropic", r.status, JSON.stringify(j).slice(0, 400));
      return send(res, r.status === 429 ? 429 : 502, { error: r.status === 429 ? "rate_limited" : "recognition_failed" });
    }
    const text = (j.content || []).filter((c) => c.type === "text").map((c) => c.text).join("");
    const result = parseJson(text);
    if (!result || typeof result !== "object") return send(res, 502, { error: "recognition_unreadable" });
    return send(res, 200, { result });
  } catch (e) {
    console.error("recognize", e);
    return send(res, 500, { error: "recognition_failed" });
  }
};
