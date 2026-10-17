// Authorized, consent-gated submission and evaluation.
// A task-scoped HMAC token must be issued out-of-band after identity verification.
// Token format: base64url(JSON {project_id,phone,exp}) + "." + base64url(HMAC-SHA256).
import { evaluateCompletion } from "./analysis/evaluate.js";
const MAX_BYTES = 4 * 1024 * 1024;
// Random task-scoped capabilities support the open pilot without a signing secret.
// This is self-registration, not verified identity or OTP authentication.
export async function identify(env, args) {
  if (args.project_id !== "ROOM-001") throw Error("Unknown project");
  const phone = args.phone;
  if (phone !== undefined && !/^09\d{8}$/.test(phone)) throw Error("Invalid phone format");
  const token = crypto.randomUUID() + crypto.randomUUID();
  const identity = { project_id: args.project_id, phone, participant_id: crypto.randomUUID(), exp: Math.floor(Date.now()/1000)+3600 };
  await env.LOG_DATA.put("sessions/" + token, JSON.stringify(identity));
  return { status: "registered", mode: "open_pilot", identity_verified: false, authorization: token, project_id: identity.project_id, expires_at: new Date(identity.exp*1000).toISOString(), next_tool: "log_prepare_upload" };
}
export async function authorize(env, token, projectId) {
  if (typeof token !== "string" || !/^[a-f0-9-]{72}$/.test(token)) throw Error("Invalid session");
  const obj = await env.LOG_DATA.get("sessions/"+token);
  const data = obj && await obj.json();
  if (!data || data.project_id !== projectId || data.exp <= Date.now()/1000) throw Error("Session expired or wrong task");
  return data;
}
export async function prepareUpload(env, args) {
  await authorize(env, args.authorization, args.project_id);
  return { status: "ready", max_bytes: MAX_BYTES, content_types: ["image/jpeg", "image/png"], next_tool: "log_submit_photo", requirements: ["Export a locally masked photo with metadata removed", "Preview the exported photo", "Obtain explicit consent; set consent and privacy_processed to true"] };
}
export async function readEvaluation(env, args) {
  const identity = await authorize(env, args.authorization, args.project_id);
  const key = (identity.phone || identity.participant_id) + "-log.json";
  const obj = await env.LOG_DATA.get(key);
  if (!obj) return { status: "awaiting_submission", next_tool: "log_submit_photo" };
  const record = await obj.json();
  // Scope records to this session, including when a phone is reused.
  if (record.participant_id !== identity.participant_id) return { status: "awaiting_submission", next_tool: "log_submit_photo" };
  return { status: record.completion.status, evaluation: record.completion.evaluation };
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
  const photoKey = (identity.phone || identity.participant_id) + "結案照片" + stamp + "-" + crypto.randomUUID() + (jpeg ? ".jpg" : ".png");
  // Data is provided only after user consent; photo bytes never go to GitHub.
  await env.LOG_DATA.put(photoKey, bytes, { httpMetadata: { contentType: jpeg ? "image/jpeg" : "image/png" } });
  let evaluation;
  try { evaluation = await evaluateCompletion(env, { photoKey, projectId: project_id }); }
  catch (error) { evaluation = { status: "manual_review", summary: "Automated evaluation unavailable; human review required" }; }
  const logKey = (identity.phone || identity.participant_id) + "-log.json";
  const record = { participant_id: identity.participant_id, phone: identity.phone, project_id, record: { updated_at: new Date().toISOString() },
    completion: { status: evaluation.status, evaluation, consent_confirmed: true, privacy_processed_attested: true },
    photos: [photoKey] };
  await env.LOG_DATA.put(logKey, JSON.stringify(record, null, 2), { httpMetadata: { contentType: "application/json" } });
  return { status: evaluation.status, photo_key: photoKey, log_key: logKey, evaluation };
}

