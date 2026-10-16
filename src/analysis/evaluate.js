// Cloudflare Workers AI completion evaluation.
// Only call after the social worker's task-scoped authorization and upload consent
// have been independently verified. Never expose this function on an anonymous route.
const MODEL = "@cf/meta/llama-3.2-11b-vision-instruct";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png"]);
const encode = (bytes) => {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(binary);
};
async function loadImage(env, key) {
  const object = await env.LOG_DATA.get(key);
  if (!object) throw new Error("Missing image: " + key);
  const type = object.httpMetadata?.contentType || (key.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg");
  if (!IMAGE_TYPES.has(type) || object.size > MAX_IMAGE_BYTES) throw new Error("Unsupported image");
  const bytes = new Uint8Array(await object.arrayBuffer());
  return "data:" + type + ";base64," + encode(bytes);
}
async function inspect(env, image, prompt) {
  const output = await env.AI.run(MODEL, {
    messages: [{ role: "user", content: [
      { type: "text", text: prompt },
      { type: "image_url", image_url: { url: image } }
    ] }],
    max_tokens: 750,
    temperature: 0.1
  });
  if (typeof output?.response !== "string" || !output.response.trim()) throw new Error("Empty vision response");
  return output.response.trim();
}
export async function evaluateCompletion(env, { photoKey, projectId = "ROOM-001" }) {
  // Caller MUST verify authorization to photoKey and projectId before invoking.
  if (!/^[^/\\]{1,180}\.(jpg|jpeg|png)$/i.test(photoKey) || photoKey === "Example.jpg") throw new Error("Invalid submission photo key");
  if (projectId !== "ROOM-001") throw new Error("Unknown project");
  const criteriaObj = await env.LOG_DATA.get("Example.json");
  if (!criteriaObj) throw new Error("Example.json not found");
  const criteria = await criteriaObj.json();
  const [example, submitted] = await Promise.all([
    loadImage(env, "Example.jpg"), loadImage(env, photoKey)
  ]);
  // Inspect separately: two-image inputs are not reliably supported by all vision models.
  const referenceDescription = await inspect(env, example,
    "Describe only visible evidence of privacy curtains and seating back support. This is a reference image, not a completion photo. Do not invent details.");
  const submissionDescription = await inspect(env, submitted,
    "Describe only visible evidence of privacy curtains and seating back support. This is a privacy-redacted completion photo. If evidence is obscured, say so. Do not infer identities.");
  const prompt = `You are a cautious social-work completion reviewer. Compare the following TWO image observations against the checklist. The reference is illustrative, not a pixel-level template. Judge the SUBMITTED photo only. Do not claim evidence that is not visible. If uncertain, return 'uncertain'. Reply as valid JSON ONLY with keys: criteria (array of {id,status,evidence,reason}, status, summary, retake_advice. status for each criterion must be pass, fail or uncertain; overall status must be pass, needs_revision or manual_review. An uncertain criterion requires manual_review. A failed criterion requires needs_revision. Criteria: ${JSON.stringify(criteria.criteria)}. Reference observation: ${referenceDescription}. Submitted observation: ${submissionDescription}.`;
  const raw = await env.AI.run(MODEL, {
    messages: [{ role: "user", content: prompt }],
    max_tokens: 1100, temperature: 0.1
  });
  const response = String(raw?.response || "");
  let parsed;
  try { parsed = JSON.parse(response.replace(/^```(?:json)?\s*|\s*```$/g, "").trim()); }
  catch { return { status: "manual_review", summary: "AI output was not valid JSON", raw_analysis: response, model: MODEL }; }
  const required = new Set(criteria.criteria.map(c => c.id));
  const statuses = new Set(["pass", "fail", "uncertain"]);
  if (!Array.isArray(parsed.criteria) || parsed.criteria.length !== required.size ||
      parsed.criteria.some(c => !required.has(c.id) || !statuses.has(c.status)) ||
      new Set(parsed.criteria.map(c => c.id)).size !== required.size) {
    return { status: "manual_review", summary: "AI returned an invalid checklist", raw_analysis: response, model: MODEL };
  }
  const derivedStatus = parsed.criteria.some(c => c.status === "uncertain") ? "manual_review" :
    parsed.criteria.some(c => c.status === "fail") ? "needs_revision" : "pass";
  return { ...parsed, status: derivedStatus, project_id: projectId,
    photo_key: photoKey, example_key: "Example.jpg", model: MODEL,
    evaluated_at: new Date().toISOString(), requires_human_review: derivedStatus !== "pass" };
}
