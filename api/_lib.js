// Ortak sunucu yardımcıları. Dış paket yok; yalnızca Node'un kendi fetch'i kullanılır.
const SB = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const ANON = process.env.SUPABASE_ANON_KEY || "";
const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const svc = () => ({ apikey: SRK, Authorization: "Bearer " + SRK });

const configured = () => !!(SB && ANON && SRK);

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

// İsteği yapan kullanıcıyı Supabase oturum belirtecinden doğrular.
async function userOf(req) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!token) return null;
  const r = await fetch(SB + "/auth/v1/user", { headers: { apikey: ANON, Authorization: "Bearer " + token } });
  if (!r.ok) return null;
  const u = await r.json();
  return u && u.id ? u : null;
}

async function db(path, opt = {}) {
  const r = await fetch(SB + "/rest/v1/" + path, {
    ...opt,
    headers: { ...svc(), "Content-Type": "application/json", Prefer: "return=representation", ...(opt.headers || {}) },
  });
  const t = await r.text();
  if (!r.ok) throw new Error("db " + r.status + " " + t.slice(0, 300));
  return t ? JSON.parse(t) : null;
}

const encPath = (p) => p.split("/").map(encodeURIComponent).join("/");

async function signUrl(bucket, path, seconds) {
  const r = await fetch(SB + "/storage/v1/object/sign/" + bucket + "/" + encPath(path), {
    method: "POST",
    headers: { ...svc(), "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn: seconds }),
  });
  const j = await r.json().catch(() => ({}));
  const rel = j.signedURL || j.signedUrl;
  if (!r.ok || !rel) throw new Error("sign " + r.status);
  return SB + "/storage/v1" + rel;
}

async function putObject(bucket, path, body, contentType) {
  const r = await fetch(SB + "/storage/v1/object/" + bucket + "/" + encPath(path), {
    method: "POST",
    headers: { ...svc(), "Content-Type": contentType, "x-upsert": "true" },
    body,
  });
  if (!r.ok) throw new Error("upload " + r.status + " " + (await r.text()).slice(0, 200));
}

// Kullanıcı yalnızca kendi klasöründeki fotoğrafları gönderebilir.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function ownPath(userId, p) {
  return typeof p === "string" && p.length < 200 && !p.includes("..") && p.startsWith(userId + "/") && /\.(jpe?g|png)$/i.test(p);
}

function readJson(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  if (typeof req.body === "string") { try { return Promise.resolve(JSON.parse(req.body)); } catch (e) { return Promise.resolve({}); } }
  return new Promise((resolve) => {
    let s = "";
    req.on("data", (c) => { s += c; if (s.length > 1e6) req.destroy(); });
    req.on("end", () => { try { resolve(JSON.parse(s || "{}")); } catch (e) { resolve({}); } });
    req.on("error", () => resolve({}));
  });
}

module.exports = { SB, ANON, configured, send, userOf, db, signUrl, putObject, ownPath, readJson, UUID };
