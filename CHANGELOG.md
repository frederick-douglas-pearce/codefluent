# Changelog

All notable changes to the CodeFluent project will be documented in this file. This covers both the VS Code extension and the web app. For extension-specific changes, see [`vscode-extension/CHANGELOG.md`](vscode-extension/CHANGELOG.md).

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [1.2.1](https://github.com/frederick-douglas-pearce/codefluent/compare/v1.2.0...v1.2.1) (2026-04-30)


### Bug Fixes

* Daily Token Usage chart DOM-leak + Pattern A render audit ([#297](https://github.com/frederick-douglas-pearce/codefluent/issues/297)) ([#303](https://github.com/frederick-douglas-pearce/codefluent/issues/303)) ([9b613a1](https://github.com/frederick-douglas-pearce/codefluent/commit/9b613a12a09c430739e7105523d8db502f34762e))

## [1.2.0](https://github.com/frederick-douglas-pearce/codefluent/compare/v1.1.0...v1.2.0) (2026-04-29)


### Features

* command/skill adoption rate metric card ([#218](https://github.com/frederick-douglas-pearce/codefluent/issues/218)) ([2b56521](https://github.com/frederick-douglas-pearce/codefluent/commit/2b565217a8660ea4a7ee6ab9108371b08d21bc26))
* detect error recovery patterns in conversation flow ([#245](https://github.com/frederick-douglas-pearce/codefluent/issues/245)) ([#249](https://github.com/frederick-douglas-pearce/codefluent/issues/249)) ([47ce02a](https://github.com/frederick-douglas-pearce/codefluent/commit/47ce02a55aed25ad4a08ee9b97d45b38431df93e))
* error recovery UI + webapp version sync ([#257](https://github.com/frederick-douglas-pearce/codefluent/issues/257), [#258](https://github.com/frederick-douglas-pearce/codefluent/issues/258)) ([cfc1f15](https://github.com/frederick-douglas-pearce/codefluent/commit/cfc1f15e563cb2e5bfa77d60b673fddba7a577e5))
* expand golden set to 46 session entries with task_type coverage ([#243](https://github.com/frederick-douglas-pearce/codefluent/issues/243)) ([#268](https://github.com/frederick-douglas-pearce/codefluent/issues/268)) ([89c22d7](https://github.com/frederick-douglas-pearce/codefluent/commit/89c22d74c7261067c7945babcf2c72da20ae4ee0))
* scoring prompt v2.0 with task_type and tightened definitions ([#242](https://github.com/frederick-douglas-pearce/codefluent/issues/242)) ([2b21e1a](https://github.com/frederick-douglas-pearce/codefluent/commit/2b21e1a078ee94aa17789be28eb8eda35ea9184b))
* scoring prompt v2.1 with tightened definitions and label fixes ([#274](https://github.com/frederick-douglas-pearce/codefluent/issues/274)) ([#285](https://github.com/frederick-douglas-pearce/codefluent/issues/285)) ([3495ed2](https://github.com/frederick-douglas-pearce/codefluent/commit/3495ed20d996fb3c15974b9c904989e1d1c4a59c))
* secret-handling hooks, SECURITY.md, and docs ([#270](https://github.com/frederick-douglas-pearce/codefluent/issues/270)) ([#272](https://github.com/frederick-douglas-pearce/codefluent/issues/272)) ([039d25c](https://github.com/frederick-douglas-pearce/codefluent/commit/039d25c66e48a1b725ad2d816a2fec15c25a023a))
* task_type_agreement eval check with Cohen's Kappa ([#244](https://github.com/frederick-douglas-pearce/codefluent/issues/244)) ([#269](https://github.com/frederick-douglas-pearce/codefluent/issues/269)) ([c7a6d19](https://github.com/frederick-douglas-pearce/codefluent/commit/c7a6d19550bd1db00ff14ebabf4c21d3b635e7b0))


### Bug Fixes

* align engines.vscode with @types/vscode after Dependabot bump ([3cfb4b9](https://github.com/frederick-douglas-pearce/codefluent/commit/3cfb4b9b701636cc1cda8183a3bc5096dc5bb080))
* deduplicate assistant messages per API turn in JSONL parser ([#253](https://github.com/frederick-douglas-pearce/codefluent/issues/253)) ([50abbe2](https://github.com/frederick-douglas-pearce/codefluent/commit/50abbe2e89f06c8b642d79b913e78489136cab7e))
* eval CI per-behavior agreement threshold enforcement ([#266](https://github.com/frederick-douglas-pearce/codefluent/issues/266)) ([6f34851](https://github.com/frederick-douglas-pearce/codefluent/commit/6f34851a0a2fbe38321cf3b5a270627cdfb26245))
* hook commands use $CLAUDE_PROJECT_DIR to survive cwd drift ([#273](https://github.com/frederick-douglas-pearce/codefluent/issues/273)) ([#279](https://github.com/frederick-douglas-pearce/codefluent/issues/279)) ([5154eac](https://github.com/frederick-douglas-pearce/codefluent/commit/5154eac6be14dfb55dee006777c6c20556cdd192))
* include subagent token usage in conversation totals ([#254](https://github.com/frederick-douglas-pearce/codefluent/issues/254)) ([#259](https://github.com/frederick-douglas-pearce/codefluent/issues/259)) ([8a0c08c](https://github.com/frederick-douglas-pearce/codefluent/commit/8a0c08c0db2cd6bf43d3d7ad29abd38e7ae413e3))
* invalidate cached scores when conversation content_hash changes ([7b910e3](https://github.com/frederick-douglas-pearce/codefluent/commit/7b910e3553e63903539f052a912db8eb964fd376))
* invalidate cached scores when conversation content_hash changes ([#228](https://github.com/frederick-douglas-pearce/codefluent/issues/228)) ([5a1a53a](https://github.com/frederick-douglas-pearce/codefluent/commit/5a1a53afb445b8b500a87ba393e7fff8036687c5))
* switch token dedup from signature-based to message-ID per Anthropic docs ([#261](https://github.com/frederick-douglas-pearce/codefluent/issues/261)) ([d85da95](https://github.com/frederick-douglas-pearce/codefluent/commit/d85da958a80b2c6aa5c3cd99ae141bb540f83b6a))
* tighten hash validation — require matching hash for legacy cache entries ([9dd15cd](https://github.com/frederick-douglas-pearce/codefluent/commit/9dd15cd603f248e3f5e43f98ca5473e32a03c4fd))

## [1.1.0](https://github.com/frederick-douglas-pearce/codefluent/compare/v1.0.1...v1.1.0) (2026-04-10)


### Features

* add .claude/ directory configuration scanner ([#158](https://github.com/frederick-douglas-pearce/codefluent/issues/158)) ([95cb455](https://github.com/frederick-douglas-pearce/codefluent/commit/95cb4553bec8342f9d69a28f62652e94e2e36cc6))
* add advisory-vs-programmatic gap detection ([#159](https://github.com/frederick-douglas-pearce/codefluent/issues/159)) ([e113cf8](https://github.com/frederick-douglas-pearce/codefluent/commit/e113cf8cb86f25c97b75cfa95e4f355d10196aa4))
* add agent metrics computation module ([#166](https://github.com/frederick-douglas-pearce/codefluent/issues/166)) ([8b1bb9e](https://github.com/frederick-douglas-pearce/codefluent/commit/8b1bb9e76657686c2b9dfb208f1e6abaf7258efe))
* add agent metrics computation module ([#166](https://github.com/frederick-douglas-pearce/codefluent/issues/166)) ([3555c99](https://github.com/frederick-douglas-pearce/codefluent/commit/3555c99b433cf26c1b3a16c11b374eb70788f658))
* add agent metrics display cards with sparklines ([#167](https://github.com/frederick-douglas-pearce/codefluent/issues/167)) ([2427ba9](https://github.com/frederick-douglas-pearce/codefluent/commit/2427ba97a3dfb756b54b21d2a249a0e7c8436c25))
* add agent metrics display cards with sparklines ([#167](https://github.com/frederick-douglas-pearce/codefluent/issues/167)) ([626f272](https://github.com/frederick-douglas-pearce/codefluent/commit/626f2722624f05bdf79417ead08c5b51fb6da3a3))
* add configuration advisor for hook generation ([#161](https://github.com/frederick-douglas-pearce/codefluent/issues/161)) ([ce34467](https://github.com/frederick-douglas-pearce/codefluent/commit/ce344670f58645779969141dff28369bf9533f1a))
* add configuration advisor for hook generation ([#161](https://github.com/frederick-douglas-pearce/codefluent/issues/161)) ([6addf73](https://github.com/frederick-douglas-pearce/codefluent/commit/6addf73d2e767386f6cfd0438aaefe377a9a6939))
* add configuration maturity display and scoring UI ([#172](https://github.com/frederick-douglas-pearce/codefluent/issues/172)) ([6634423](https://github.com/frederick-douglas-pearce/codefluent/commit/6634423d90ca1f941c98ad6213cdd7a98fa3e326))
* add configuration maturity display and scoring UI ([#172](https://github.com/frederick-douglas-pearce/codefluent/issues/172)) ([724521b](https://github.com/frederick-douglas-pearce/codefluent/commit/724521b240b2747543ef162ecb62a373576b56db))
* add conversation detail view with expandable rows ([#168](https://github.com/frederick-douglas-pearce/codefluent/issues/168)) ([0d140a9](https://github.com/frederick-douglas-pearce/codefluent/commit/0d140a9f79290f7a43b8ef9c92b8fda7dbe78256))
* add conversation detail view with expandable rows ([#168](https://github.com/frederick-douglas-pearce/codefluent/issues/168)) ([31eb4f4](https://github.com/frederick-douglas-pearce/codefluent/commit/31eb4f488b9a8e7f5203055179d15fb081aa06f6))
* add Conversations tab with sortable list view and charts ([#133](https://github.com/frederick-douglas-pearce/codefluent/issues/133)) ([e1c79a7](https://github.com/frederick-douglas-pearce/codefluent/commit/e1c79a742ec5b4ccb17864615ba9e047a3e25514))
* add Conversations tab with sortable list view and charts ([#133](https://github.com/frederick-douglas-pearce/codefluent/issues/133)) ([19c1b4d](https://github.com/frederick-douglas-pearce/codefluent/commit/19c1b4d033b65d325016f926350e090e9e473f17))
* add duration distribution and avg length trend charts ([#169](https://github.com/frederick-douglas-pearce/codefluent/issues/169)) ([74ba1ce](https://github.com/frederick-douglas-pearce/codefluent/commit/74ba1cec0499b29e727ca192ab9f1b7c42a476e1))
* add duration distribution and avg length trend charts ([#169](https://github.com/frederick-douglas-pearce/codefluent/issues/169)) ([f994fb5](https://github.com/frederick-douglas-pearce/codefluent/commit/f994fb5833a25c686df84e04198042f7a87f51ea))
* add heuristic task classification module ([#150](https://github.com/frederick-douglas-pearce/codefluent/issues/150)) ([6ff91ef](https://github.com/frederick-douglas-pearce/codefluent/commit/6ff91ef024ee67b7541ee7e5fe32eb7772be95ed))
* add inter-conversation gap distribution histogram with threshold line ([#186](https://github.com/frederick-douglas-pearce/codefluent/issues/186)) ([ae3be9d](https://github.com/frederick-douglas-pearce/codefluent/commit/ae3be9db6970d55704c9eee40bc513367179e1a1))
* add inter-prompt gap distribution histogram with threshold line ([#186](https://github.com/frederick-douglas-pearce/codefluent/issues/186)) ([154df4f](https://github.com/frederick-douglas-pearce/codefluent/commit/154df4f27c722b749e2888999ba63ced5e363158))
* add structured output anti-pattern detection ([#171](https://github.com/frederick-douglas-pearce/codefluent/issues/171)) ([0926250](https://github.com/frederick-douglas-pearce/codefluent/commit/092625069a8503ba4bbe9baae97e9201ed740fa8))
* add task type distribution display ([#170](https://github.com/frederick-douglas-pearce/codefluent/issues/170)) ([9170c90](https://github.com/frederick-douglas-pearce/codefluent/commit/9170c908ec263e0bed1c7c6a27d452076f51661b))
* enforcement gap detection + analytics endpoint fix ([#159](https://github.com/frederick-douglas-pearce/codefluent/issues/159)) ([cbdc65d](https://github.com/frederick-douglas-pearce/codefluent/commit/cbdc65d34e834057ebc354d4932a9cc110fe0f39))
* integrate round 1 modules into conversation assembly ([c982953](https://github.com/frederick-douglas-pearce/codefluent/commit/c98295325299706410a2539f5f5c95eafebf365a))
* reorder tabs for user workflow flow ([#198](https://github.com/frederick-douglas-pearce/codefluent/issues/198)) ([1474efe](https://github.com/frederick-douglas-pearce/codefluent/commit/1474efee1b26e0220bb40b43e9a0d017f003e3fe))
* reorder tabs for user workflow flow ([#198](https://github.com/frederick-douglas-pearce/codefluent/issues/198)) ([8ae40d4](https://github.com/frederick-douglas-pearce/codefluent/commit/8ae40d4266fb3b376391ad186b9c5c284ba771a7))
* track custom command and skill usage as conversation signal ([#206](https://github.com/frederick-douglas-pearce/codefluent/issues/206)) ([#216](https://github.com/frederick-douglas-pearce/codefluent/issues/216)) ([17fa54f](https://github.com/frederick-douglas-pearce/codefluent/commit/17fa54f62d33a0db9c6fca130f24e4f3509e3bcd))
* treat /clear commands as conversation boundaries ([#194](https://github.com/frederick-douglas-pearce/codefluent/issues/194)) ([786a917](https://github.com/frederick-douglas-pearce/codefluent/commit/786a91753d841d9643ff8ca8402726d584f66ac8))
* treat /clear commands as conversation boundaries ([#194](https://github.com/frederick-douglas-pearce/codefluent/issues/194)) ([aa1aded](https://github.com/frederick-douglas-pearce/codefluent/commit/aa1aded58e76658a505a71d4ccb363a70ae1a7d0))
* v1.1 Round 1 — task classification, anti-pattern detection, config scanner ([2f6540a](https://github.com/frederick-douglas-pearce/codefluent/commit/2f6540a0944f6bd7d7a4a86e2a4a6f34b2c4a887))
* v1.1 Round 2 — task type display + enforcement gap detection ([86b2adb](https://github.com/frederick-douglas-pearce/codefluent/commit/86b2adb3779692315da77d3a6d4a67b1bf0ed31f))


### Bug Fixes

* agent metrics card overflow and doughnut aspect ratio in sidebar ([a841d8a](https://github.com/frederick-douglas-pearce/codefluent/commit/a841d8a3647223e36d63300eb95b284db6e813e4))
* agent metrics cards overflow with min-width:0 + overflow:hidden ([b9698d0](https://github.com/frederick-douglas-pearce/codefluent/commit/b9698d0a20ff5081ee6fa755f9b0b6195fa5f053))
* chain release build into release-please workflow ([#156](https://github.com/frederick-douglas-pearce/codefluent/issues/156)) ([a41d3f7](https://github.com/frederick-douglas-pearce/codefluent/commit/a41d3f704421ba3f0a3174fb46f479b289c8a44b))
* chain release build into release-please workflow ([#156](https://github.com/frederick-douglas-pearce/codefluent/issues/156)) ([a19fadb](https://github.com/frederick-douglas-pearce/codefluent/commit/a19fadbb419f1341f20befc19bfe1da87b2d8046))
* circular doughnut via CSS override and responsive:false ([#202](https://github.com/frederick-douglas-pearce/codefluent/issues/202)) ([4c5fbd5](https://github.com/frederick-douglas-pearce/codefluent/commit/4c5fbd52cf0a726e1959d6a62817a427bd6c33a7))
* config maturity score not detecting hook matchers ([e39dbdf](https://github.com/frederick-douglas-pearce/codefluent/commit/e39dbdf741fee475c5ab59d556e37356ea755b1a))
* config maturity score not detecting hook matchers ([9962c80](https://github.com/frederick-douglas-pearce/codefluent/commit/9962c80fb27bcfc76e235e5407bcc4019de73dcd))
* constrain doughnut chart width for circular rendering in sidebar ([32c0b15](https://github.com/frederick-douglas-pearce/codefluent/commit/32c0b15cefed37e1dc5a7c24345e7594037a3774))
* conversations tab spacing to match Usage tab patterns ([8b30b4d](https://github.com/frederick-douglas-pearce/codefluent/commit/8b30b4dbbc2773cf15063e32fd367dbf4fe692af))
* conversations tab uses short project name for analytics filter ([af139b6](https://github.com/frederick-douglas-pearce/codefluent/commit/af139b6fd983c9bcac571330937f6948ccf33968))
* detail view padding specificity — override table td padding:0 ([d4eda7f](https://github.com/frederick-douglas-pearce/codefluent/commit/d4eda7f2cb7434bbc36ff702ee0155a61fcfe67f))
* detail view text wrapping and spacing for sidebar layout ([f0225ca](https://github.com/frederick-douglas-pearce/codefluent/commit/f0225ca4acfa10af214cd319b46c4bc50fdb8527))
* doughnut chart aspect ratio in VS Code sidebar ([#202](https://github.com/frederick-douglas-pearce/codefluent/issues/202)) ([c34a7ed](https://github.com/frederick-douglas-pearce/codefluent/commit/c34a7ede78a59c1b33a4ddca102c28402b84de96))
* enforcement coverage uses keyword overlap instead of event-only match ([#211](https://github.com/frederick-douglas-pearce/codefluent/issues/211)) ([d01d127](https://github.com/frederick-douglas-pearce/codefluent/commit/d01d127fb7b381e98c2e815850d06cca5f27a3ad))
* enforcement coverage uses keyword overlap instead of event-only match ([#211](https://github.com/frederick-douglas-pearce/codefluent/issues/211)) ([710f2b4](https://github.com/frederick-douglas-pearce/codefluent/commit/710f2b4882585a483fbb43fa18113c9a0ec25f1a))
* filter all slash commands from prompts, not just system commands ([fbdb754](https://github.com/frederick-douglas-pearce/codefluent/commit/fbdb7544c1acfe50acabef59298eb4be6d2f11aa))
* filter system commands from conversation metrics ([#195](https://github.com/frederick-douglas-pearce/codefluent/issues/195)) ([115719c](https://github.com/frederick-douglas-pearce/codefluent/commit/115719c115988402ded1cebad2b5e1231ece10b8))
* filter system-injected messages from user prompts ([#222](https://github.com/frederick-douglas-pearce/codefluent/issues/222)) ([#223](https://github.com/frederick-douglas-pearce/codefluent/issues/223)) ([bea0fff](https://github.com/frederick-douglas-pearce/codefluent/commit/bea0ffffa2c07e8f72ae9dfd37fc6cad0a61f02e))
* force 2-column grid for agent metrics cards in VS Code sidebar ([8134604](https://github.com/frederick-douglas-pearce/codefluent/commit/8134604b002f74e298ed854c739c6d67745a6d8b))
* gap chart y-axis auto-scale and threshold label position ([1b36d49](https://github.com/frederick-douglas-pearce/codefluent/commit/1b36d4929c2276fcf1c1905e985d2c2b31a525d4))
* include new fields in conversation-analytics endpoint response ([6a274dc](https://github.com/frederick-douglas-pearce/codefluent/commit/6a274dc3a6d699cacd124a944e53e5d04340c18c))
* increase detail view padding for better margins ([3463050](https://github.com/frederick-douglas-pearce/codefluent/commit/3463050469441f523b645f3ee472a273965f1f50))
* ISO week key used local time instead of UTC for date extraction ([7a21c53](https://github.com/frederick-douglas-pearce/codefluent/commit/7a21c53637ecd365d2e1cda5985b53dc740e321e))
* MCP scanner checks ~/.claude.json project-level mcpServers ([#210](https://github.com/frederick-douglas-pearce/codefluent/issues/210)) ([#215](https://github.com/frederick-douglas-pearce/codefluent/issues/215)) ([bd48ea7](https://github.com/frederick-douglas-pearce/codefluent/commit/bd48ea70319f5adb566eca6ca6965ff8725eccbb))
* remove redundant apply instructions bullet point ([0345a1a](https://github.com/frederick-douglas-pearce/codefluent/commit/0345a1a42efb6e01ad5580fd01d7decd97747f6f))
* rename detail view CSS class to avoid conflict with existing conversation-detail ([a8462b0](https://github.com/frederick-douglas-pearce/codefluent/commit/a8462b02a97efdbf9c0d8ee80e9a509d2cd0b184))
* resolve npm audit vulnerabilities in dev dependencies ([#162](https://github.com/frederick-douglas-pearce/codefluent/issues/162)) ([312c1d8](https://github.com/frederick-douglas-pearce/codefluent/commit/312c1d800f4dc9fbf76398ad4a7e88f6140731a4))
* resolve npm audit vulnerabilities in dev dependencies ([#162](https://github.com/frederick-douglas-pearce/codefluent/issues/162)) ([cbbd34f](https://github.com/frederick-douglas-pearce/codefluent/commit/cbbd34fce3552f8dd187d7f5b53a504df74fc414))
* robust markdown fence stripping for config advisor JSON response ([f1d8420](https://github.com/frederick-douglas-pearce/codefluent/commit/f1d84203aa6988231085b21905659c8627715046))
* set Chart.js aspectRatio:1 for circular doughnut in both interfaces ([0153849](https://github.com/frederick-douglas-pearce/codefluent/commit/01538498680212c623a510781502545294f8f2a8))
* stack conversation charts vertically to match Usage tab pattern ([d470e15](https://github.com/frederick-douglas-pearce/codefluent/commit/d470e15b02ce29e390f72e25aed15d5791f9388f))
* system command filtering + doughnut aspect ratio ([#195](https://github.com/frederick-douglas-pearce/codefluent/issues/195), [#202](https://github.com/frederick-douglas-pearce/codefluent/issues/202)) ([4d8fb2e](https://github.com/frederick-douglas-pearce/codefluent/commit/4d8fb2e1cda14010aa57348a413df88835a099f3))
* use content hash for stable score cache lookup ([#182](https://github.com/frederick-douglas-pearce/codefluent/issues/182)) ([003fc12](https://github.com/frederick-douglas-pearce/codefluent/commit/003fc12288a34de129cdc609818604f89719a8c4))
* use content hash for stable score cache lookup ([#182](https://github.com/frederick-douglas-pearce/codefluent/issues/182)) ([416341c](https://github.com/frederick-douglas-pearce/codefluent/commit/416341c50ec8514d47432ab2673efcf0b8004e87))
* use correct ISO 8601 week algorithm in client-side charts ([#188](https://github.com/frederick-douglas-pearce/codefluent/issues/188)) ([c71d012](https://github.com/frederick-douglas-pearce/codefluent/commit/c71d012f25f175a52735a61974e559618620e677))

## [1.0.1](https://github.com/frederick-douglas-pearce/codefluent/compare/v1.0.0...v1.0.1) (2026-03-25)


### Bug Fixes

* Run Analysis scores stale conversation data instead of latest sessions ([#151](https://github.com/frederick-douglas-pearce/codefluent/issues/151)) ([ffa5d05](https://github.com/frederick-douglas-pearce/codefluent/commit/ffa5d057eeec229570994de6c68628d23209f41e))
* Run Analysis scores stale conversation data instead of latest sessions ([#151](https://github.com/frederick-douglas-pearce/codefluent/issues/151)) ([32fc95b](https://github.com/frederick-douglas-pearce/codefluent/commit/32fc95b64d4f93b9259b0a1e3493537083d70c58))

## [1.0.0](https://github.com/frederick-douglas-pearce/codefluent/compare/v0.3.0...v1.0.0) (2026-03-22)


### ⚠ BREAKING CHANGES

* Sessions replaced by conversations as the primary analytics unit. Conversations are formed by gap-based splitting across session files, producing more meaningful scoring windows and accurate per-day attribution.

### Features

* add automated scoring regression eval runner ([#123](https://github.com/frederick-douglas-pearce/codefluent/issues/123)) ([94ccf2a](https://github.com/frederick-douglas-pearce/codefluent/commit/94ccf2a0a5d25586825af04aa0cb14a78e049f9a))
* add centralized configuration infrastructure ([#132](https://github.com/frederick-douglas-pearce/codefluent/issues/132)) ([#134](https://github.com/frederick-douglas-pearce/codefluent/issues/134)) ([cde6cef](https://github.com/frederick-douglas-pearce/codefluent/commit/cde6cefd60c8b04dde24a6407c55b7b63aa5842e))
* add conversation assembly layer for gap-based analytics ([#130](https://github.com/frederick-douglas-pearce/codefluent/issues/130)) ([967d389](https://github.com/frederick-douglas-pearce/codefluent/commit/967d389f01aa1358385c697d562d19e602b7cccc))
* add golden evaluation set for scoring prompt regression testing ([#110](https://github.com/frederick-douglas-pearce/codefluent/issues/110)) ([#119](https://github.com/frederick-douglas-pearce/codefluent/issues/119)) ([f614c61](https://github.com/frederick-douglas-pearce/codefluent/commit/f614c61689abf677e669a55cedc34f670f43fe2b))
* add inter-message gap analysis tool and methodology docs ([#131](https://github.com/frederick-douglas-pearce/codefluent/issues/131)) ([#135](https://github.com/frederick-douglas-pearce/codefluent/issues/135)) ([6b94705](https://github.com/frederick-douglas-pearce/codefluent/commit/6b9470546d8cec87ae3efc06f726d1fbe709346d))
* conversation-based analytics redesign ([a7e829e](https://github.com/frederick-douglas-pearce/codefluent/commit/a7e829e1c475042866f0b5e3b0b2a50bb0493f4a))
* conversation-based analytics redesign ([#130](https://github.com/frederick-douglas-pearce/codefluent/issues/130)) ([f533290](https://github.com/frederick-douglas-pearce/codefluent/commit/f5332908c655f5ea5d68949a0aaf4e5d97530a3b))
* migrate scoring, analytics, and caching to conversation-based ([#130](https://github.com/frederick-douglas-pearce/codefluent/issues/130)) ([1115dff](https://github.com/frederick-douglas-pearce/codefluent/commit/1115dff92507edc05bd8f96f2be3d56ffb7bbd0f))
* rename session→conversation in frontend terminology and docs ([#130](https://github.com/frederick-douglas-pearce/codefluent/issues/130)) ([8b7a80c](https://github.com/frederick-douglas-pearce/codefluent/commit/8b7a80cc4b5ce759984fa2aaa59cda3488094dde))
* restrict CLAUDE.md config scoring to 3 eligible behaviors ([#118](https://github.com/frederick-douglas-pearce/codefluent/issues/118)) ([#127](https://github.com/frederick-douglas-pearce/codefluent/issues/127)) ([0094ccd](https://github.com/frederick-douglas-pearce/codefluent/commit/0094ccd371d93bfd97f8a56ea5c434094c85fcdc))


### Bug Fixes

* add conversation-named aliases to get_scores aggregate response ([#130](https://github.com/frederick-douglas-pearce/codefluent/issues/130)) ([8240f38](https://github.com/frederick-douglas-pearce/codefluent/commit/8240f38518d8dc5d4c46d4c50e9502998f7738d5))
* add conversation-named keys to webapp analytics aggregates ([#130](https://github.com/frederick-douglas-pearce/codefluent/issues/130)) ([a761efd](https://github.com/frederick-douglas-pearce/codefluent/commit/a761efd937895048da1403b52616a59cb951e279))
* add FORCE_JAVASCRIPT_ACTIONS_TO_NODE24 to release-please workflow ([aa14fc0](https://github.com/frederick-douglas-pearce/codefluent/commit/aa14fc09627e2c74f88346d8202426acd0f076a2))
* add proper cell padding and heading to webapp conversation table ([#137](https://github.com/frederick-douglas-pearce/codefluent/issues/137)) ([3e4c50d](https://github.com/frederick-douglas-pearce/codefluent/commit/3e4c50d316522d37987f67a42df85b5168d7c074))
* conversation table formatting lacks cell padding/spacing ([b4393c4](https://github.com/frederick-douglas-pearce/codefluent/commit/b4393c4a831b4b794dc8648c5f0172deee4fab74))
* prevent stale browser cache and null element crash on Usage tab ([#130](https://github.com/frederick-douglas-pearce/codefluent/issues/130)) ([dbebdd1](https://github.com/frederick-douglas-pearce/codefluent/commit/dbebdd137e171a7757345d70f34b71aa1b1a3d87))
* prompt counts inflated by tool_result messages ([fe86df6](https://github.com/frederick-douglas-pearce/codefluent/commit/fe86df619cf1f468e1a1fea84756b69a7dc4722d))
* prompt counts inflated by tool_result messages counted as user prompts ([#139](https://github.com/frederick-douglas-pearce/codefluent/issues/139)) ([0a59df4](https://github.com/frederick-douglas-pearce/codefluent/commit/0a59df431297a350b45f1201d993c45fadafdf87))
* scoring parity between VS Code extension and webapp Usage tab ([#142](https://github.com/frederick-douglas-pearce/codefluent/issues/142)) ([a7ee5c3](https://github.com/frederick-douglas-pearce/codefluent/commit/a7ee5c382dcd5904f1a4cce74f8e55a797768ff6))

## [0.3.0] - 2026-03-14

### Added

- **Session token analytics** — per-session token aggregation from JSONL data with cost estimation, cache efficiency ratios, and output/input ratios. Available in both VS Code extension and webapp Usage tabs (#86, #87, #88, #89)
- **Cost-efficiency scatter charts** — 3 Chart.js scatter plots (Cost/Prompt vs Cache Hit Rate, Cost/Prompt vs Output/Input Ratio, Fluency Score vs Cost/Prompt) with continuous red-amber-green color gradient by fluency score (#90, #102)
- **Per-session cost estimation** — model-specific pricing from `shared/pricing.json` applied to token counts (#91)
- **Session analytics project filtering** — filter analytics by project in both interfaces (#104)
- **Shared pricing data** — `shared/pricing.json` with time-aware model pricing for cost calculations

### Changed

- Daily Token Usage chart switched to log scale for better visualization across varying usage levels (#100)
- Replaced Avg Tokens/Prompt summary card with Avg Cost/Prompt; added Cost/Prompt column to session details table
- Documentation overhaul: rewrote TECHNICAL_SPEC.md and UI_SPEC.md (removed stale code blocks, fixed inaccuracies), updated all READMEs, expanded CONTRIBUTING.md for both interfaces (#95)
- Test coverage: 528 extension tests (14 suites), 241 webapp tests (5 suites) — 769 total

### Fixed

- Session analytics OOM crash on large datasets
- Sparkline score history not scoped to current project
- Repo detection for dotted names (e.g., `.github.io`)
- Score chart y-axis clipping above 100
- Security review workflow checkout authentication

## [0.2.0] - 2026-03-08

### Added

- **Prompt Optimizer** — paste any prompt and get an optimized version with missing fluency behaviors added; config-aware so it won't add behaviors already covered by CLAUDE.md (#54)
- **Webapp project scoping** — project dropdown scopes Fluency Score, Prompt Optimizer, and Quick Wins to a specific repo; settings bar visibility refined per tab (#52, #62)
- **Personalized recommendations** — expanded coaching for all 11 fluency behaviors with high/medium impact categories, concrete examples, and research citations (#44)
- **CI/CD pipeline** — GitHub Actions for tests, security review, AI code review, and automated release with Marketplace publishing (#55, #66)
- **Security hardening** — path traversal fix, API key redaction on all error paths, security response headers (#68)
- **Health endpoint** — `GET /health` returns status, version, and dependency checks (#69)
- **Webapp test suite** — 193 tests across 5 suites (#67, #79)
- **Versioned prompt templates** — shared `shared/prompts/` directory with registry, used by both interfaces
- **Dependency auditing** — `npm audit` and `pip-audit` in CI (#66, #68)
- **Dependabot** — automated dependency update PRs

### Changed

- Claude-review workflow triggers on `needs-review` label instead of every push
- Empty state messages for Usage tab and ccusage-not-installed error (#43, #45)

### Fixed

- Prompt optimizer `behaviors_added` computed from actual score diff instead of self-report
- Webapp optimizer project path resolution for CLAUDE.md lookup
- Path traversal vulnerability in `_decode_project_path()` (#68)
- API key leakage in error messages (#68)

## [0.1.0] - 2026-03-03

### Added

- AI fluency scoring — analyzes Claude Code prompts against 11 research-backed behaviors (0–100 score)
- CLAUDE.md config scoring — credit for fluency behaviors defined as project conventions
- Usage dashboard — daily/monthly token usage, cost tracking, session history via `ccusage`
- Weekly score trend tracking with sparkline chart
- Quick Wins — GitHub-repo-scoped task suggestions with one-click Claude Code launch
- Coaching tab — personalized tips based on weakest fluency behaviors
- Score caching with stale-while-revalidate
- Nonce-based CSP and XSS-safe HTML rendering
- Shell injection protection for all subprocess calls
- Cross-platform support (Linux, macOS, Windows)
- Web app — standalone FastAPI + vanilla JS alternative to the VS Code extension
