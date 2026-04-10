Compile the VS Code extension TypeScript, package the VSIX, and install it:

1. `cd vscode-extension && npm run compile`
2. `npx @vscode/vsce package --allow-missing-repository`
3. `code --install-extension codefluent-1.1.0.vsix --force`    <!-- x-release-please-version -->

Report success or failure for each step. After completion, remind me to reload the VS Code window.
