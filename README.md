# WorkLog MCP

Agent-independent social-work photo completion toolkit on Cloudflare Workers.

## Endpoints
- `GET /health`: health status
- `POST /mcp`: MCP Streamable HTTP JSON-RPC endpoint (no Cloudflare Access or user-supplied API key)

## Tools
- `log_get_task`: read public demo criteria from R2 `public-tasks/{project_id}/criteria.json`
- `log_privacy_guide`: local masking and consent instructions
- `log_identify`, `log_prepare_upload`, `log_submit_photo`, `log_evaluate`: disabled placeholders pending secure implementation

**Privacy:** Do not send personal phone numbers or original photos to this MVP. Public MCP discovery does not authorize private record access. Production requires OTP/task-scoped authorization, rate limits, browser-side masking preview, explicit consent and audited R2 writes.

## Setup
1. Create Cloudflare R2 bucket `log-data` and enable Workers AI.
2. Configure GitHub Actions secrets `G_Deploy2026` and `G_account_id`.
3. Push to `main` to deploy through GitHub Actions.
4. Test `/health` and MCP `initialize` / `tools/list`.

The GitHub deployment token is for CI only; social workers never provide it.
