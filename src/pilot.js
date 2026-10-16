// Public pilot: evaluates preloaded non-personal demo images only.
// No personal identifiers, user-uploaded images, or public R2 writes.
import { evaluateCompletion } from "./analysis/evaluate.js";
export async function runPilotEvaluation(env) {
  const key = "Pilot-completion.jpg";
  const object = await env.LOG_DATA.head(key);
  if (!object) return { status: "missing_demo_photo", required_r2_key: key, message: "Upload a privacy-safe fictional pilot image to R2 before testing." };
  const evaluation = await evaluateCompletion(env, { photoKey: key, projectId: "ROOM-001" });
  return { mode: "open_pilot", persisted: false, evaluation };
}
