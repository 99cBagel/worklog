import { formPage } from "./form.js";
import { identify, prepareUpload, readEvaluation, submitAndEvaluate } from "./submission.js";
import { runPilotEvaluation } from "./pilot.js";
// WorkLog MCP: public discovery, no Cloudflare Access or user-supplied API key.
// Open pilot uses expiring task-scoped sessions and explicit upload consent.
const HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type, mcp-protocol-version, mcp-session-id",
  "access-control-expose-headers": "mcp-session-id",
};
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: HEADERS });
const text = (value, status = 200) => new Response(value, { status, headers: { ...HEADERS, "content-type": "text/plain; charset=utf-8" } });
const result = (value, isError = false) => ({ content: [{ type: "text", text: JSON.stringify(value) }], isError });
const tools = [
  { name: "log_get_task", description: "Read non-sensitive task criteria and reference metadata by project ID. Never expose private task or participant information.", inputSchema: { type: "object", properties: { project_id: { type: "string", maxLength: 80 } }, required: ["project_id"], additionalProperties: false } },
  { name: "log_privacy_guide", description: "Guide the agent to redact faces and personal information locally BEFORE upload, preview the edited result, and obtain explicit approval.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  ...[
    ["log_identify", "Register for open pilot; self-declared identity, no OTP or API key. Phone optional.", { project_id: { type: "string" }, phone: { type: "string", pattern: "^09[0-9]{8}$" } }, ["project_id"]],
    ["log_prepare_upload", "Get upload requirements. Mask locally, remove metadata, preview and get consent before submission.", {}, []],
    ["log_submit_photo", "Upload an approved privacy-processed JPEG/PNG and evaluate with Cloudflare Workers AI.", { photo_base64: { type: "string", maxLength: 5592408 }, consent: { const: true }, privacy_processed: { const: true } }, ["photo_base64", "consent", "privacy_processed"]],
    ["log_evaluate", "Retrieve the evaluation for this pilot session's submitted photo. Submit first to run AI.", {}, []]
  ].map(([name, description, properties, required]) => ({ name, description, inputSchema: { type: "object", properties: { ...properties, ...(name === "log_identify" ? {} : { project_id: { type: "string" }, authorization: { type: "string" } }) }, required: [...required, ...(name === "log_identify" ? [] : ["project_id", "authorization"])], additionalProperties: false } }))
];
async function callTool(name, args, env) {
  if (name === "log_privacy_guide") return result({
    steps: ["Select a photo on the device", "Identify faces, names, phone numbers, IDs, addresses, screens and other personal data", "Use local Gaussian blur for faces; use opaque masks for names, IDs and readable text", "Preview the exported masked image, including metadata removal", "Ask the social worker for explicit consent before uploading"],
    form_url: "/form",
    presentation: "請用繁體中文簡短回覆，每次一個動作。不要展示工具名稱、Token、JSON、內部狀態或實作說明。需要選項與照片處理時，引導使用者開啟同站 /form 表單。",
    warning: "The MCP server cannot guarantee an agent can edit image bytes. Use a local web preview as fallback. Never send an original photo to a remote model for masking."
  });
  if (name === "log_get_task") {
    const id = args?.project_id;
    if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(id)) return result({ error: "Invalid project_id" }, true);
    // Only public demo task data under public-tasks/ can be read anonymously.
    const object = await env.LOG_DATA.get("Example.json");
    if (!object || id !== "ROOM-001") return result({ error: "Public task not found" }, true);
    try { return result({ project_id: id, criteria: JSON.parse(await object.text()) }); }
    catch { return result({ error: "Task data is invalid" }, true); }
  }
  const handlers = { log_identify: identify, log_prepare_upload: prepareUpload, log_submit_photo: submitAndEvaluate, log_evaluate: readEvaluation };
  if (handlers[name]) {
    try { return result(await handlers[name](env, args)); }
    catch (error) { return result({ status: "rejected", message: error.message }, true); }
  }
  return result({ error: "Unknown tool" }, true);
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if ((url.pathname === "/" || url.pathname === "/form") && request.method === "GET") return new Response(formPage, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer" } });
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: HEADERS });
    if (url.pathname === "/health" && request.method === "GET") return json({ ok: true, service: "worklog-mcp", version: "0.2.0", upload_enabled: true, mode: "open_pilot", identity_verified: false });
    if (url.pathname === "/pilot/evaluate" && request.method === "POST") {
      try { return json(await runPilotEvaluation(env)); }
      catch { return json({ status: "manual_review", error: "Pilot evaluation failed; check Workers AI model and R2 example files" }, 503); }
    }
    if (url.pathname === "/submit" && request.method === "POST") {
      const length = Number(request.headers.get("content-length") || 0);
      if (length > 5_700_000) return json({ error: "Payload too large" }, 413);
      let body;
      try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
      try { return json(await submitAndEvaluate(env, body)); }
      catch { return json({ error: "Submission rejected or failed" }, 403); }
    }
    if (url.pathname !== "/mcp") return json({ error: "Not found" }, 404);
    if (request.method === "GET") return text("SSE stream not available; use MCP Streamable HTTP POST.", 405);
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
    const len = Number(request.headers.get("content-length") || 0);
    if (len > 5_700_000) return json({ error: "Request too large" }, 413);
    let body;
    try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
    if (!body || Array.isArray(body) || body.jsonrpc !== "2.0" || typeof body.method !== "string") return json({ jsonrpc: "2.0", id: body?.id ?? null, error: { code: -32600, message: "Invalid request" } }, 400);
    if (body.id === undefined) return new Response(null, { status: 202, headers: HEADERS });
    const ok = (value) => json({ jsonrpc: "2.0", id: body.id, result: value });
    const err = (code, message) => json({ jsonrpc: "2.0", id: body.id, error: { code, message } });
    switch (body.method) {
      case "initialize": return ok({ protocolVersion: "2025-03-26", capabilities: { tools: { listChanged: false } }, instructions: "Use concise Traditional Chinese: one short status and one next action. Never show authorization tokens, internal field names, tool names, JSON, or implementation details. Example: 登錄完成。請開啟照片表單，處理個資後確認送出。 For fields, choices and local Gaussian blur photo editing, link to /form on this MCP server origin. Chat clients may not render native fields; do not pretend options are clickable unless supported.", serverInfo: { name: "worklog-mcp", version: "0.2.0" } });
      case "ping": return ok({});
      case "tools/list": return ok({ tools });
      case "tools/call": {
        const name = body.params?.name;
        if (!tools.some(t => t.name === name)) return err(-32602, "Unknown tool");
        try { return ok(await callTool(name, body.params?.arguments || {}, env)); }
        catch { return err(-32603, "Internal error"); }
      }
      default: return err(-32601, "Method not found");
    }
  }
};

