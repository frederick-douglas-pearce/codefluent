Compile the VS Code extension TypeScript, package the VSIX, and install it:

1. `cd vscode-extension && npm run compile`
2. `npx @vscode/vsce package --allow-missing-repository`
3. `code --install-extension codefluent-1.3.0.vsix --force || true`    <!-- x-release-please-version -->
4. Verify: `code --list-extensions --show-versions | grep codefluent`

NOTE: Step 3 returns exit code 1 in the Claude Code shell but the install succeeds. The `|| true` prevents a false failure. Step 4 confirms the correct version is installed.

Report success or failure for each step. After completion, remind me to reload the VS Code window.
