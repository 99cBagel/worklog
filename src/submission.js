// Authorized, consent-gated submission and evaluation.
// A task-scoped HMAC token must be issued out-of-band after identity verification.
// Token format: base64url(JSON {project_id,phone,exp}) + "." + base64url(HMAC-SHA256).
import { evaluateCompletion } from "./analysis/evaluate.js";
const MAX_BYTES = 4 * 1024 * 1024;
const utf8 = new TextEncoder();
function base64url(bytes) {
  let str = ""; for (let i = 0; i < bytes.length; i += 8192) str += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromBase64url(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw Error("Invalid token");
  const raw = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}
async function authorize(env, token, projectId) {
  if (!env.WORKLOG_TOKEN_SECRET || typeof token !== "string" || token.length > 2048) throw Error("Authorization unavailable");
  const parts = token.split(".");
  if (parts.length !== 2) throw Error("Invalid authorization");
  const key = await crypto.subtle.importKey("raw", utf8.encode(env.WORKLOG_TOKEN_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("HMAC", key, fromBase64url(parts[1]), utf8.encode(parts[0]));
  if (!ok) throw Error("Invalid authorization");
  const data = JSON.parse(new TextDecoder().decode(fromBase64url(parts[0])));
  if (data.project_id !== projectId || !/^09\d{8}$/.test(data.phone) ||
      !Number.isSafeInteger(data.exp) || data.exp <= Date.now() / 1000 ||
      data.exp > Date.now() / 1000 + 86400) throw Error("Authorization expired or wrong task");
  return data;
}
export async function submitAndEvaluate(env, args) {
  const { project_id, authorization, photo_base64, consent, privacy_processed } = args || {};
  if (project_id !== "ROOM-001") throw Error("Unknown project");
  if (consent !== true || privacy_processed !== true) throw Error("Explicit upload consent and privacy processing confirmation required");
  const identity = await authorize(env, authorization, project_id);
  if (typeof photo_base64 !== "string" || photo_base64.length > MAX_BYTES * 1.4 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(photo_base64)) throw Error("Invalid photo data");
  const raw = atob(photo_base64);
  if (raw.length > MAX_BYTES || raw.length < 100) throw Error("Invalid image size");
  const bytes = Uint8Array.from(raw, c => c.charCodeAt(0));
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes.slice(0, 8).every((v, i) => v === [137,80,78,71,13,10,26,10][i]);
  if (!jpeg && !png) throw Error("Only JPEG or PNG accepted");
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const photoKey = identity.phone + "結案照片" + stamp + (jpeg ? ".jpg" : ".png");
  // Data is provided only after user consent; photo bytes never go to GitHub.
  await env.LOG_DATA.put(photoKey, bytes, { httpMetadata: { contentType: jpeg ? "image/jpeg" : "image/png" } });
  let evaluation;
  try { evaluation = await evaluateCompletion(env, { photoKey, projectId: project_id }); }
  catch (error) { evaluation = { status: "manual_review", summary: "Automated evaluation unavailable; human review required" }; }
  const logKey = identity.phone + "-log.json";
  const record = { phone: identity.phone, project_id, record: { updated_at: new Date().toISOString() },
    completion: { status: evaluation.status, evaluation, consent_confirmed: true, privacy_processed_attested: true },
    photos: [photoKey] };
  await env.LOG_DATA.put(logKey, JSON.stringify(record, null, 2), { httpMetadata: { contentType: "application/json" } });
  return { status: evaluation.status, photo_key: photoKey, log_key: logKey, evaluation };
}
