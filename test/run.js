// Sunucu işlevlerini sahte servis yanıtlarıyla çalıştırır. Gerçek ağ çağrısı yapılmaz.
process.env.SUPABASE_URL = "https://sb.test"; process.env.SUPABASE_ANON_KEY = "anon"; process.env.SUPABASE_SERVICE_ROLE_KEY = "srk";
process.env.ANTHROPIC_API_KEY = "ak"; process.env.MESHY_API_KEY = "mk";
const assert = require("assert");
const U = "11111111-1111-4111-8111-111111111111", C = "22222222-2222-4222-8222-222222222222";
let car, calls, meshyTask, recent;
const J = (o, status = 200) => ({ ok: status < 300, status, json: async () => o, text: async () => JSON.stringify(o), arrayBuffer: async () => new ArrayBuffer(8) });
global.fetch = async (url, opt = {}) => {
  calls.push((opt.method || "GET") + " " + url);
  if (url.includes("/auth/v1/user")) return opt.headers.Authorization === "Bearer good" ? J({ id: U }) : J({}, 401);
  if (url.includes("/object/sign/")) { assert(url.includes(U + "/")); return J({ signedURL: "/object/sign/x?token=t" }); }
  if (url.includes("/rest/v1/cars") && (opt.method || "GET") === "GET") return J(url.includes("model_requested_at") ? recent : url.includes("owner_id=eq." + U) ? [car] : []);
  if (url.includes("/rest/v1/cars") && opt.method === "PATCH") { Object.assign(car, JSON.parse(opt.body)); return J([car]); }
  if (url.includes("/storage/v1/object/upload/sign/car-models/")) return J({ url: "/object/upload/sign/car-models/x?token=tok1" });
  if (url.includes("/storage/v1/object/car-models/")) return J({});
  if (url === "https://api.anthropic.com/v1/messages") { const b = JSON.parse(opt.body); assert.equal(b.messages[0].content.filter((c) => c.type === "image").length, 2);
    return J({ content: [{ type: "text", text: 'İşte: {"is_vehicle":true,"brand":{"value":"Fiat","confidence":0.9}}' }] }); }
  if (url === "https://api.meshy.ai/openapi/v1/multi-image-to-3d") { const b = JSON.parse(opt.body); assert(b.image_urls.length >= 1 && b.image_urls.length <= 4); return J({ result: "task1" }); }
  if (url.startsWith("https://api.meshy.ai/openapi/v1/multi-image-to-3d/")) return J(meshyTask);
  if (url.startsWith("https://assets.test/")) return J({});
  throw new Error("beklenmeyen çağrı " + url);
};
const call = (file, req) => new Promise((resolve) => { const res = { setHeader() {}, end(s) { resolve({ status: res.statusCode, body: JSON.parse(s) }); } };
  require("../api/" + file)(Object.assign({ method: "GET", headers: {}, url: "/" }, req), res); });
const auth = { authorization: "Bearer good" };
const fresh = () => { calls = []; recent = []; car = { id: C, owner_id: U, user_confirmed: true, model_status: "none", model_progress: 0,
  photo_paths: ["rearq", "right", "left", "rear", "front", "frontq"].map((s) => U + "/d/" + s + ".jpg") }; };

(async () => {
  fresh();
  let r = await call("config.js", {}); assert(r.body.ready && r.body.recognition && r.body.model3d);

  r = await call("recognize.js", { method: "POST", headers: {}, body: { paths: [U + "/d/front.jpg"] } }); assert.equal(r.status, 401);
  r = await call("recognize.js", { method: "POST", headers: auth, body: { paths: ["someone-else/d/front.jpg"] } }); assert.equal(r.status, 400);
  r = await call("recognize.js", { method: "POST", headers: auth, body: { paths: [U + "/../x/front.jpg"] } }); assert.equal(r.status, 400);
  r = await call("recognize.js", { method: "POST", headers: auth, body: { paths: [U + "/d/front.jpg", U + "/d/rear.jpg"] } });
  assert.equal(r.status, 200); assert.equal(r.body.result.brand.value, "Fiat");

  const { pickPhotos } = require("../api/model-start.js");
  assert.deepEqual(pickPhotos(car.photo_paths).map((p) => p.split("/").pop()), ["front.jpg", "left.jpg", "rear.jpg", "frontq.jpg"]);

  r = await call("model-start.js", { method: "POST", headers: auth, body: { carId: "nope" } }); assert.equal(r.status, 400);
  recent = [1, 2, 3]; r = await call("model-start.js", { method: "POST", headers: auth, body: { carId: C } }); assert.equal(r.status, 429);
  recent = []; r = await call("model-start.js", { method: "POST", headers: auth, body: { carId: C } });
  assert.equal(r.status, 200); assert.equal(car.model_status, "queued"); assert.equal(car.model_task_id, "task1");
  const n = calls.length; r = await call("model-start.js", { method: "POST", headers: auth, body: { carId: C } });
  assert(!calls.slice(n).some((c) => c.includes("meshy")), "süren üretim varken ikinci görev açılmamalı");

  meshyTask = { status: "IN_PROGRESS", progress: 40 };
  r = await call("model-status.js", { headers: auth, query: { carId: C } }); assert.equal(car.model_status, "processing"); assert.equal(car.model_progress, 40);
  meshyTask = { status: "SUCCEEDED", progress: 100, model_urls: { glb: "https://assets.test/m.glb", usdz: "https://assets.test/m.usdz" }, thumbnail_url: "https://assets.test/t.png" };
  r = await call("model-status.js", { headers: auth, query: { carId: C } });
  assert.equal(car.model_status, "ready"); assert.equal(car.model_glb_path, U + "/" + C + "/model.glb"); assert.equal(car.model_usdz_path, U + "/" + C + "/model.usdz");
  const m = calls.length; await call("model-status.js", { headers: auth, query: { carId: C } });
  assert(!calls.slice(m).some((c) => c.includes("meshy")), "hazır model yeniden sorgulanmamalı");

  fresh(); car.model_status = "processing"; car.model_task_id = "task1"; meshyTask = { status: "FAILED", task_error: { message: "bad input" } };
  await call("model-status.js", { headers: auth, query: { carId: C } }); assert.equal(car.model_status, "failed"); assert.equal(car.model_error, "bad input");

  fresh(); r = await call("model-upload.js", { method: "POST", headers: auth, body: { carId: C } });
  assert.equal(r.status, 200); assert.equal(r.body.token, "tok1"); assert(r.body.path.startsWith(U + "/" + C + "/upload-") && r.body.path.endsWith(".glb"));
  r = await call("model-upload.js", { method: "POST", headers: {}, body: { carId: C } }); assert.equal(r.status, 401);

  console.log("Tüm sunucu testleri geçti.");
})().catch((e) => { console.error(e); process.exit(1); });
