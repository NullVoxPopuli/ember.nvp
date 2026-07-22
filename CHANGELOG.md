# Changelog

## Release (2026-07-22)

* ember.nvp 1.2.0 (minor)
* @nullvoxpopuli/ember-rolldown 2.2.0 (minor)

#### :rocket: Enhancement
* `@nullvoxpopuli/ember-rolldown`, `ember.nvp`
  * [#98](https://github.com/NullVoxPopuli/ember.nvp/pull/98) Integration-test ember-scoped-css; add babel.templateTransforms ([@NullVoxPopuli-ai-agent](https://github.com/NullVoxPopuli-ai-agent))

#### :bug: Bug Fix
* `@nullvoxpopuli/ember-rolldown`
  * [#99](https://github.com/NullVoxPopuli/ember.nvp/pull/99) rolldown: fix virtual .gts declaration resolution + specifier-rewrite sourcemaps ([@NullVoxPopuli](https://github.com/NullVoxPopuli))

#### Committers: 2
- @NullVoxPopuli's reduced-access machine account for AI usage ([@NullVoxPopuli-ai-agent](https://github.com/NullVoxPopuli-ai-agent))
- [@NullVoxPopuli](https://github.com/NullVoxPopuli)

## Release (2026-07-22)

* ember.nvp 1.1.0 (minor)
* @nullvoxpopuli/ember-rolldown 2.1.0 (minor)

#### :rocket: Enhancement
* `@nullvoxpopuli/ember-rolldown`
  * [#97](https://github.com/NullVoxPopuli/ember.nvp/pull/97) Add appReexports plugin as a separate ember-rolldown entrypoint ([@NullVoxPopuli-ai-agent](https://github.com/NullVoxPopuli-ai-agent))
  * [#95](https://github.com/NullVoxPopuli/ember.nvp/pull/95) enable declaration maps in the rolldown plugin ([@NullVoxPopuli](https://github.com/NullVoxPopuli))
* `ember.nvp`
  * [#91](https://github.com/NullVoxPopuli/ember.nvp/pull/91) Add a browser extension project type (minimal-extension base) ([@NullVoxPopuli-ai-agent](https://github.com/NullVoxPopuli-ai-agent))

#### :memo: Documentation
* `@nullvoxpopuli/ember-rolldown`, `ember.nvp`
  * [#96](https://github.com/NullVoxPopuli/ember.nvp/pull/96) rolldown: document + test co-located CSS support ([@NullVoxPopuli](https://github.com/NullVoxPopuli))

#### :house: Internal
* `@nullvoxpopuli/ember-rolldown`, `ember.nvp`
  * [#93](https://github.com/NullVoxPopuli/ember.nvp/pull/93) More tests ([@NullVoxPopuli](https://github.com/NullVoxPopuli))
* `ember.nvp`
  * [#92](https://github.com/NullVoxPopuli/ember.nvp/pull/92) Move check layers into their own permutation matrix ([@NullVoxPopuli-ai-agent](https://github.com/NullVoxPopuli-ai-agent))
  * [#90](https://github.com/NullVoxPopuli/ember.nvp/pull/90) Remove pinYukuParser test helper ([@Copilot](https://github.com/apps/copilot-swe-agent))
  * [#89](https://github.com/NullVoxPopuli/ember.nvp/pull/89) refactor(test): extract shared listFiles/read helpers to #test-helpers ([@Copilot](https://github.com/apps/copilot-swe-agent))
  * [#87](https://github.com/NullVoxPopuli/ember.nvp/pull/87) Convert Greeting declaration check to inline snapshot assertion ([@Copilot](https://github.com/apps/copilot-swe-agent))

#### Committers: 3
- @NullVoxPopuli's reduced-access machine account for AI usage ([@NullVoxPopuli-ai-agent](https://github.com/NullVoxPopuli-ai-agent))
- Copilot [Bot] ([@copilot-swe-agent](https://github.com/apps/copilot-swe-agent))
- [@NullVoxPopuli](https://github.com/NullVoxPopuli)

## Release (2026-07-18)

* ember.nvp 1.0.0 (major)
* @nullvoxpopuli/ember-rolldown 2.0.0 (major)

#### :boom: Breaking Change
* `@nullvoxpopuli/ember-rolldown`, `ember.nvp`
  * [#86](https://github.com/NullVoxPopuli/ember.nvp/pull/86) Remove defineConfig ([@NullVoxPopuli](https://github.com/NullVoxPopuli))

#### :rocket: Enhancement
* `@nullvoxpopuli/ember-rolldown`, `ember.nvp`
  * [#84](https://github.com/NullVoxPopuli/ember.nvp/pull/84) Create config plugin for rolldown ([@NullVoxPopuli](https://github.com/NullVoxPopuli))

#### Committers: 1
- [@NullVoxPopuli](https://github.com/NullVoxPopuli)

## Release (2026-07-17)

* ember.nvp 0.7.0 (minor)
* @nullvoxpopuli/ember-build-tooling-utils 1.1.0 (minor)
* @nullvoxpopuli/ember-rolldown 1.1.0 (minor)
* @nullvoxpopuli/ember-vite 1.1.0 (minor)

#### :rocket: Enhancement
* `ember.nvp`
  * [#78](https://github.com/NullVoxPopuli/ember.nvp/pull/78) publint and are-the-types-wrong layers ([@NullVoxPopuli-ai-agent](https://github.com/NullVoxPopuli-ai-agent))
  * [#77](https://github.com/NullVoxPopuli/ember.nvp/pull/77) TypeScript is the default for libraries ([@NullVoxPopuli-ai-agent](https://github.com/NullVoxPopuli-ai-agent))
  * [#73](https://github.com/NullVoxPopuli/ember.nvp/pull/73) Implement the vitest layer for libraries ([@NullVoxPopuli-ai-agent](https://github.com/NullVoxPopuli-ai-agent))
  * [#71](https://github.com/NullVoxPopuli/ember.nvp/pull/71) Add inspector-support layer (Ember Inspector wiring via ember-estree codemod) ([@NullVoxPopuli-ai-agent](https://github.com/NullVoxPopuli-ai-agent))
* `@nullvoxpopuli/ember-vite`, `ember.nvp`
  * [#72](https://github.com/NullVoxPopuli/ember.nvp/pull/72) qunit layer: support libraries (tests without any index.html) ([@NullVoxPopuli-ai-agent](https://github.com/NullVoxPopuli-ai-agent))
  * [#61](https://github.com/NullVoxPopuli/ember.nvp/pull/61) Update maybeBabel ([@NullVoxPopuli](https://github.com/NullVoxPopuli))
* `ember.nvp`, `@nullvoxpopuli/ember-build-tooling-utils`, `@nullvoxpopuli/ember-rolldown`, `@nullvoxpopuli/ember-vite`
  * [#63](https://github.com/NullVoxPopuli/ember.nvp/pull/63) Library support via rolldown ([@NullVoxPopuli](https://github.com/NullVoxPopuli))
  * [#66](https://github.com/NullVoxPopuli/ember.nvp/pull/66) Lean on node 24: RegExp.escape, import.meta.dirname, fs.rm ([@NullVoxPopuli-ai-agent](https://github.com/NullVoxPopuli-ai-agent))
* `@nullvoxpopuli/ember-rolldown`, `ember.nvp`
  * [#67](https://github.com/NullVoxPopuli/ember.nvp/pull/67) Export our own defineConfig, preloaded with ember library defaults ([@NullVoxPopuli-ai-agent](https://github.com/NullVoxPopuli-ai-agent))
  * [#64](https://github.com/NullVoxPopuli/ember.nvp/pull/64) Make both library flavors build: isolated declarations, hbs targetFormat, real tests ([@NullVoxPopuli-ai-agent](https://github.com/NullVoxPopuli-ai-agent))
* `@nullvoxpopuli/ember-build-tooling-utils`, `@nullvoxpopuli/ember-rolldown`, `ember.nvp`
  * [#65](https://github.com/NullVoxPopuli/ember.nvp/pull/65) No generated babel.config.js; drop the plugin packages' dist build ([@NullVoxPopuli-ai-agent](https://github.com/NullVoxPopuli-ai-agent))
* `@nullvoxpopuli/ember-vite`
  * [#62](https://github.com/NullVoxPopuli/ember.nvp/pull/62) Cleanup maybeBabel ([@NullVoxPopuli](https://github.com/NullVoxPopuli))

#### :bug: Bug Fix
* `@nullvoxpopuli/ember-build-tooling-utils`, `@nullvoxpopuli/ember-rolldown`, `ember.nvp`
  * [#83](https://github.com/NullVoxPopuli/ember.nvp/pull/83) Can't publish TS, build with rolldown ([@NullVoxPopuli](https://github.com/NullVoxPopuli))
* `@nullvoxpopuli/ember-rolldown`
  * [#82](https://github.com/NullVoxPopuli/ember.nvp/pull/82) Fix watching in the rolldown plugin ([@NullVoxPopuli](https://github.com/NullVoxPopuli))
* `ember.nvp`
  * [#79](https://github.com/NullVoxPopuli/ember.nvp/pull/79) The library base generates an empty src ([@NullVoxPopuli-ai-agent](https://github.com/NullVoxPopuli-ai-agent))
  * [#74](https://github.com/NullVoxPopuli/ember.nvp/pull/74) Generated TS libraries type check: drop allowJs, load ember/glint types ([@NullVoxPopuli-ai-agent](https://github.com/NullVoxPopuli-ai-agent))
  * [#70](https://github.com/NullVoxPopuli/ember.nvp/pull/70) Library template is private; generated libraries are publishable ([@NullVoxPopuli-ai-agent](https://github.com/NullVoxPopuli-ai-agent))
  * [#58](https://github.com/NullVoxPopuli/ember.nvp/pull/58) Fix lint:types in generated qunit apps: import #app/app.ts with extension ([@NullVoxPopuli-ai-agent](https://github.com/NullVoxPopuli-ai-agent))
  * [#59](https://github.com/NullVoxPopuli/ember.nvp/pull/59) Make freshly generated apps pass their own pnpm lint ([@NullVoxPopuli-ai-agent](https://github.com/NullVoxPopuli-ai-agent))
* `@nullvoxpopuli/ember-vite`, `ember.nvp`
  * [#75](https://github.com/NullVoxPopuli/ember.nvp/pull/75) packages/vite: built-in babel fallback when no config file exists ([@NullVoxPopuli-ai-agent](https://github.com/NullVoxPopuli-ai-agent))

#### :memo: Documentation
* `@nullvoxpopuli/ember-build-tooling-utils`, `@nullvoxpopuli/ember-rolldown`, `ember.nvp`
  * [#68](https://github.com/NullVoxPopuli/ember.nvp/pull/68) Docs pass: outcome-focused, timeless READMEs and comments ([@NullVoxPopuli-ai-agent](https://github.com/NullVoxPopuli-ai-agent))

#### :house: Internal
* `ember.nvp`
  * [#81](https://github.com/NullVoxPopuli/ember.nvp/pull/81) Split the app permutations CI slice in two ([@NullVoxPopuli-ai-agent](https://github.com/NullVoxPopuli-ai-agent))
  * [#80](https://github.com/NullVoxPopuli/ember.nvp/pull/80) Split the app and library permutations CI slices in two ([@NullVoxPopuli-ai-agent](https://github.com/NullVoxPopuli-ai-agent))
  * [#76](https://github.com/NullVoxPopuli/ember.nvp/pull/76) Shard CI: per-base permutation files, parallel Node Tests jobs ([@NullVoxPopuli-ai-agent](https://github.com/NullVoxPopuli-ai-agent))
* `@nullvoxpopuli/ember-rolldown`, `@nullvoxpopuli/ember-vite`, `ember.nvp`
  * [#69](https://github.com/NullVoxPopuli/ember.nvp/pull/69) Remove comments from config files (generated and in READMEs) ([@NullVoxPopuli-ai-agent](https://github.com/NullVoxPopuli-ai-agent))

#### Committers: 2
- @NullVoxPopuli's reduced-access machine account for AI usage ([@NullVoxPopuli-ai-agent](https://github.com/NullVoxPopuli-ai-agent))
- [@NullVoxPopuli](https://github.com/NullVoxPopuli)

## Release (2026-07-04)

* ember.nvp 0.6.0 (minor)

#### :rocket: Enhancement
* `ember.nvp`
  * [#56](https://github.com/NullVoxPopuli/ember.nvp/pull/56) Stage all generation in a copy-on-write overlay; confirm before writing ([@NullVoxPopuli-ai-agent](https://github.com/NullVoxPopuli-ai-agent))

#### Committers: 1
- @NullVoxPopuli's reduced-access machine account for AI usage ([@NullVoxPopuli-ai-agent](https://github.com/NullVoxPopuli-ai-agent))

## Release (2026-06-29)

* ember.nvp 0.5.0 (minor)

#### :rocket: Enhancement
* `ember.nvp`
  * [#55](https://github.com/NullVoxPopuli/ember.nvp/pull/55) Upgrade @clack/prompts ([@tcjr](https://github.com/tcjr))

#### :house: Internal
* `ember.nvp`
  * [#53](https://github.com/NullVoxPopuli/ember.nvp/pull/53) Add typescript to root ([@tcjr](https://github.com/tcjr))

#### Committers: 1
- Tom Carter ([@tcjr](https://github.com/tcjr))

## Release (2026-06-23)

* ember.nvp 0.4.0 (minor)

#### :rocket: Enhancement
* `ember.nvp`
  * [#48](https://github.com/NullVoxPopuli/ember.nvp/pull/48) replaceOrUpdate ([@NullVoxPopuli](https://github.com/NullVoxPopuli))

#### :bug: Bug Fix
* `ember.nvp`
  * [#52](https://github.com/NullVoxPopuli/ember.nvp/pull/52) Fix test-helper ([@NullVoxPopuli](https://github.com/NullVoxPopuli))

#### :house: Internal
* `ember.nvp`
  * [#50](https://github.com/NullVoxPopuli/ember.nvp/pull/50) Tests for qunit ([@NullVoxPopuli](https://github.com/NullVoxPopuli))
  * [#49](https://github.com/NullVoxPopuli/ember.nvp/pull/49) Prepare Release ([@github-actions[bot]](https://github.com/apps/github-actions))

#### Committers: 2
- GitHub Actions [Bot] ([@github-actions](https://github.com/apps/github-actions))
- [@NullVoxPopuli](https://github.com/NullVoxPopuli)

## Release (2026-06-22)

* ember.nvp 0.3.0 (minor)

#### :rocket: Enhancement
* `ember.nvp`
  * [#48](https://github.com/NullVoxPopuli/ember.nvp/pull/48) replaceOrUpdate ([@NullVoxPopuli](https://github.com/NullVoxPopuli))

#### Committers: 1
- [@NullVoxPopuli](https://github.com/NullVoxPopuli)

## Release (2026-06-22)

* ember.nvp 0.2.6 (patch)
* @nullvoxpopuli/ember-vite 1.0.3 (patch)

#### :bug: Bug Fix
* `@nullvoxpopuli/ember-vite`, `ember.nvp`
  * [#46](https://github.com/NullVoxPopuli/ember.nvp/pull/46) compile ts authored packages ([@NullVoxPopuli](https://github.com/NullVoxPopuli))

#### Committers: 1
- [@NullVoxPopuli](https://github.com/NullVoxPopuli)

## Release (2026-06-22)

* ember.nvp 0.2.5 (patch)

#### :bug: Bug Fix
* `ember.nvp`
  * [#44](https://github.com/NullVoxPopuli/ember.nvp/pull/44) Fix new git ([@NullVoxPopuli](https://github.com/NullVoxPopuli))

#### Committers: 1
- [@NullVoxPopuli](https://github.com/NullVoxPopuli)

## Release (2026-06-22)

* ember.nvp 0.2.4 (patch)

#### :bug: Bug Fix
* `ember.nvp`
  * [#42](https://github.com/NullVoxPopuli/ember.nvp/pull/42) fix falsey depndencies ([@NullVoxPopuli](https://github.com/NullVoxPopuli))

#### Committers: 1
- [@NullVoxPopuli](https://github.com/NullVoxPopuli)

## Release (2026-06-22)

* ember.nvp 0.2.3 (patch)
* @nullvoxpopuli/ember-vite 1.0.2 (patch)

#### :bug: Bug Fix
* `@nullvoxpopuli/ember-vite`, `ember.nvp`
  * [#41](https://github.com/NullVoxPopuli/ember.nvp/pull/41) Fix version range usage ([@NullVoxPopuli](https://github.com/NullVoxPopuli))
* `ember.nvp`
  * [#40](https://github.com/NullVoxPopuli/ember.nvp/pull/40) Ensure imports exist ([@NullVoxPopuli](https://github.com/NullVoxPopuli))

#### Committers: 1
- [@NullVoxPopuli](https://github.com/NullVoxPopuli)

## Release (2026-06-01)

* ember.nvp 0.2.2 (patch)
* @nullvoxpopuli/ember-vite 1.0.1 (patch)

#### :house: Internal
* `@nullvoxpopuli/ember-vite`
  * [#36](https://github.com/NullVoxPopuli/ember.nvp/pull/36) Fix npm provenance failure for @nullvoxpopuli/ember-vite publish ([@Copilot](https://github.com/apps/copilot-swe-agent))
* `ember.nvp`, `@nullvoxpopuli/ember-vite`
  * [#37](https://github.com/NullVoxPopuli/ember.nvp/pull/37) Revert "Prepare Release" ([@NullVoxPopuli](https://github.com/NullVoxPopuli))

#### Committers: 2
- Copilot [Bot] ([@copilot-swe-agent](https://github.com/apps/copilot-swe-agent))
- [@NullVoxPopuli](https://github.com/NullVoxPopuli)

## Release (2026-05-15)

* ember.nvp 0.2.1 (patch)

#### :bug: Bug Fix
* `ember.nvp`
  * [#29](https://github.com/NullVoxPopuli/ember.nvp/pull/29) Fix production vite build broken by setTesting in app/config.ts ([@Copilot](https://github.com/apps/copilot-swe-agent))

#### :house: Internal
* `ember.nvp`
  * [#31](https://github.com/NullVoxPopuli/ember.nvp/pull/31) Update release-plan ([@NullVoxPopuli](https://github.com/NullVoxPopuli))

#### Committers: 2
- Copilot [Bot] ([@copilot-swe-agent](https://github.com/apps/copilot-swe-agent))
- [@NullVoxPopuli](https://github.com/NullVoxPopuli)

## Release (2026-01-28)

* ember.nvp 0.2.0 (minor)

#### :rocket: Enhancement
* `ember.nvp`
  * [#20](https://github.com/NullVoxPopuli/ember.nvp/pull/20) Implement idemponent and modern qunit layer ([@NullVoxPopuli](https://github.com/NullVoxPopuli))
  * [#18](https://github.com/NullVoxPopuli/ember.nvp/pull/18) Ensure the TS utilities handle the babel plugin ([@NullVoxPopuli](https://github.com/NullVoxPopuli))
  * [#17](https://github.com/NullVoxPopuli/ember.nvp/pull/17) Support emitting JavaScript projects ([@NullVoxPopuli](https://github.com/NullVoxPopuli))
  * [#16](https://github.com/NullVoxPopuli/ember.nvp/pull/16) Commit changes automatically if git is in use ([@NullVoxPopuli](https://github.com/NullVoxPopuli))
  * [#14](https://github.com/NullVoxPopuli/ember.nvp/pull/14) Add idempotent GitHub Actions ci.yml ([@NullVoxPopuli](https://github.com/NullVoxPopuli))
  * [#11](https://github.com/NullVoxPopuli/ember.nvp/pull/11) Add idempotent renovate config generation ([@NullVoxPopuli](https://github.com/NullVoxPopuli))
  * [#9](https://github.com/NullVoxPopuli/ember.nvp/pull/9)  Add eslint codemod/applyable, enable type checking internally on the JS ([@NullVoxPopuli](https://github.com/NullVoxPopuli))
  * [#8](https://github.com/NullVoxPopuli/ember.nvp/pull/8) Add idempotent prettier codemod/applyable ([@NullVoxPopuli](https://github.com/NullVoxPopuli))
  * [#6](https://github.com/NullVoxPopuli/ember.nvp/pull/6) Add git support with proper defaults (ie automatic --skip-git if you are already in a git repo) ([@NullVoxPopuli](https://github.com/NullVoxPopuli))
  * [#4](https://github.com/NullVoxPopuli/ember.nvp/pull/4) Implementation: minimal-app ([@NullVoxPopuli](https://github.com/NullVoxPopuli))

#### :bug: Bug Fix
* `ember.nvp`
  * [#22](https://github.com/NullVoxPopuli/ember.nvp/pull/22) Fix accidental stdoutput during git interactions ([@NullVoxPopuli](https://github.com/NullVoxPopuli))
  * [#10](https://github.com/NullVoxPopuli/ember.nvp/pull/10) Various CLI fixes ([@NullVoxPopuli](https://github.com/NullVoxPopuli))

#### :memo: Documentation
* `ember.nvp`
  * [#12](https://github.com/NullVoxPopuli/ember.nvp/pull/12) Clarify rationale and usage caveats in README ([@NullVoxPopuli](https://github.com/NullVoxPopuli))

#### :house: Internal
* `ember.nvp`
  * [#19](https://github.com/NullVoxPopuli/ember.nvp/pull/19) Forgot to enable tests for GH Actions ([@NullVoxPopuli](https://github.com/NullVoxPopuli))
  * [#21](https://github.com/NullVoxPopuli/ember.nvp/pull/21) Refactor hases and wantses ([@NullVoxPopuli](https://github.com/NullVoxPopuli))
  * [#15](https://github.com/NullVoxPopuli/ember.nvp/pull/15) Add reapply test utility for more easily re-applying layers in the manual testing ([@NullVoxPopuli](https://github.com/NullVoxPopuli))
  * [#13](https://github.com/NullVoxPopuli/ember.nvp/pull/13) Speed up permutations test ([@NullVoxPopuli](https://github.com/NullVoxPopuli))
  * [#7](https://github.com/NullVoxPopuli/ember.nvp/pull/7) Implement idempotent testing for layers that may (or may not) have been applied during the initial generation of a project ([@NullVoxPopuli](https://github.com/NullVoxPopuli))

#### Committers: 1
- [@NullVoxPopuli](https://github.com/NullVoxPopuli)

## Release (2026-01-21)

* ember.nvp 0.1.0 (minor)

#### :rocket: Enhancement
* `ember.nvp`
  * [#1](https://github.com/NullVoxPopuli/ember.nvp/pull/1) Implementation planning ([@NullVoxPopuli](https://github.com/NullVoxPopuli))

#### :house: Internal
* `ember.nvp`
  * [#2](https://github.com/NullVoxPopuli/ember.nvp/pull/2) pnpm dlx create-release-plan-setup@latest --update ([@NullVoxPopuli](https://github.com/NullVoxPopuli))
  * [#1](https://github.com/NullVoxPopuli/ember.nvp/pull/1) Implementation planning ([@NullVoxPopuli](https://github.com/NullVoxPopuli))

#### Committers: 1
- [@NullVoxPopuli](https://github.com/NullVoxPopuli)
