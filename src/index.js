import { evaluateCompletion } from "./analysis/evaluate.js";
// WorkLog MCP: public discovery, no Cloudflare Access or user-supplied API key.
// Write operations remain disabled until task-scoped authorization is implemented.
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
  { name: "log_identify", description: "Explain how phone and project verification will work. Authentication is not yet enabled; do not submit personal data.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "log_prepare_upload", description: "Not yet enabled: requires verified task authorization and explicit user approval.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "log_submit_photo", description: "Not yet enabled: never accept raw or unapproved photos.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "log_evaluate", description: "Not yet enabled: requires an approved submission and a validated vision model.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
];
async function callTool(name, args, env) {
  if (name === "log_privacy_guide") return result({
    steps: ["Select a photo on the device", "Identify faces, names, phone numbers, IDs, addresses, screens and other personal data", "Apply irreversible opaque masks locally", "Preview the exported masked image, including metadata removal", "Ask the social worker for explicit consent before uploading"],
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
  if (name === "log_evaluate") return result({ status: "authorization_required", engine: "Cloudflare Workers AI", message: "Evaluation engine is implemented but cannot run until task-scoped authorization and approved photo submission are implemented. Never provide private R2 keys through public MCP." }, true);
  if (tools.some(t => t.name === name)) return result({ status: "not_implemented", message: "Protected workflow disabled until task-scoped authorization, privacy preview and consent are implemented. Do not provide a phone number or upload a photo." }, true);
  return result({ error: "Unknown tool" }, true);
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: HEADERS });
    if (url.pathname === "/health" && request.method === "GET") return json({ ok: true, service: "worklog-mcp", version: "0.1.0", upload_enabled: false });
    if (url.pathname !== "/mcp") return json({ error: "Not found" }, 404);
    if (request.method === "GET") return text("SSE stream not available; use MCP Streamable HTTP POST.", 405);
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
    const len = Number(request.headers.get("content-length") || 0);
    if (len > 65536) return json({ error: "Request too large" }, 413);
    let body;
    try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
    if (!body || Array.isArray(body) || body.jsonrpc !== "2.0" || typeof body.method !== "string") return json({ jsonrpc: "2.0", id: body?.id ?? null, error: { code: -32600, message: "Invalid request" } }, 400);
    if (body.id === undefined) return new Response(null, { status: 202, headers: HEADERS });
    const ok = (value) => json({ jsonrpc: "2.0", id: body.id, result: value });
    const err = (code, message) => json({ jsonrpc: "2.0", id: body.id, error: { code, message } });
    switch (body.method) {
      case "initialize": return ok({ protocolVersion: "2025-03-26", capabilities: { tools: { listChanged: false } }, serverInfo: { name: "worklog-mcp", version: "0.1.0" } });
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
