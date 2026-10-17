# WorkLog MCP open pilot

Version 0.2.0. Public MCP at `/mcp`; no API key, OTP, or signing secret required.

1. `log_get_task` with `project_id: ROOM-001`.
2. `log_identify` with project_id and optional phone. Returns a one-hour authorization capability. Registration is self-declared, not verified identity. Keep the capability private.
3. `log_prepare_upload` with project_id and authorization. Mask locally, remove metadata, preview the final export and obtain explicit consent.
4. `log_submit_photo` with project_id, authorization, photo_base64, consent:true and privacy_processed:true. Accepts JPEG/PNG up to 4 MiB. Saves to private R2 and runs Workers AI.
5. `log_evaluate` with project_id and authorization retrieves this session's result. AI failures return manual_review.

R2 requires Example.json and Example.jpg. Missing reference photo prevents AI assessment; submissions remain available for human review. Phone is optional; without it filenames use a random participant ID. The server relies on the uploader's privacy-processing attestation.

GitHub Actions deploys main using G_Deploy2026 and G_account_id. Worker name remains log-worker. `npm run check` runs syntax and workflow tests.
