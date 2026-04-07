Run the full E2E testing workflow:

1. Start the webapp server: `cd webapp && uv run uvicorn main:app --port 8001`
2. Run Playwright MCP E2E smoke tests against http://localhost:8001 following the checklist in CLAUDE.md
3. Stop the webapp server
4. Rebuild and install the VS Code extension (compile, package VSIX, install)
5. Provide a checklist of items for manual VS Code extension testing

Report results for each step. If any E2E test fails, stop and report the failure before proceeding.
