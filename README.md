# ember.nvp

_ember project generator: a reenvisioning of blueprints -- hopefully one day to upstream back in to ember-cli / official blueprints, **if** all the caveats can be cleaned up_

> [!NOTE]
> **Why isn't this work happening in the default blueprints?** for a long time now, I've felt the old blueprint system from the very early days of ember-cli has not allowed for expressive enough layering of what people actually want out of a project generator. That said, that means there are some compromises in the CLI/generator in this repo. Throughout all files generated, whenever there is a caveat, there will be a comment in the file with the caveat, explaining status, open issues, and how we can collectively move forward. It's possible that one day ember-cli adopts or is inspired by this project, but it's too early to tell at the moment.

_I can't recommend using this tool unless you're comfortable with the emitted caveats in the project_.
(And with debugging build issues.)

But I'm very excited about this tool, because it's everything I've ever wanted from a project generator.
Each layer is idempotent, and knows about the other layers.
For example: set up a project with github-actions but without eslint.
When you add eslint later, your github-actions are updated as well.
This works in any order.

## Usage

```bash
npx ember.nvp
```

or, faster:

```bash
pnpm dlx ember.nvp
```

Using the unreleased version:

```bash
pnpm dlx NullVoxPopuli/ember.nvp
# or, slower:
npx NullVoxPopuli/ember.nvp
```

### Updating an existing project

You can run `ember.nvp` on top of an existing project to add layers to it.

Run it inside the project. When the current directory has a `package.json`, the first question is what to do with it:

- **update**: update the project in this directory. The name starts as the `package.json` name, and the type starts as the type that ember.nvp detects (app, library, browser extension, or custom element).
- **replace**: delete this directory and generate a new project in it.
- **new**: generate a new project in another directory.

`--path` skips this question, and `--replaceOrUpdate` answers it.

Nothing is written to your project until you confirm. Before finishing, you choose to:

- **write the files**: apply all of the staged changes
- **review the diff**: step through each changed file, and accept or reject it (or accept / reject everything remaining)
- **cancel**: discard everything. Your project is untouched.

Only files that actually changed are written.
`node_modules`, `.git`, and everything else in your project are left alone.
The accepted changes land as uncommitted edits, for you to review with your own git tooling.

New projects skip the confirmation, and are written as soon as generation succeeds.
For scripting, `--write yes` / `--write no` answers the confirmation up front.

### Migrating from an older blueprint

Run ember.nvp in a project from one of these blueprints, and choose update:

| Blueprint                                                                       | Becomes   |
| ------------------------------------------------------------------------------- | --------- |
| `@ember/addon-blueprint`, and the addon package of `@embroider/addon-blueprint` | a library |
| `@ember-tooling/classic-build-addon-blueprint` (classic addons)                 | a library |
| `@ember/app-blueprint` (Vite with `@embroider/compat`)                          | an app    |
| `@ember-tooling/classic-build-app-blueprint` (classic apps)                     | an app    |

ember.nvp checks the project before it asks about layers.
When the project uses something that ember.nvp does not support, such as v1 addons or `.hbs` templates, ember.nvp lists each item with what to do, and writes nothing.
Most of these items also work in the old setup, so you can fix them there first.

Otherwise, the migration keeps your code, and replaces the old build:

- libraries build with tsdown, and keep `addon-main.cjs`, so that apps with ember-cli can still use them
- apps build with Vite, without `@embroider/compat`

The layers that replace the old tooling, such as qunit for the tests, start selected.
After writing, ember.nvp lists what is left for you, such as settings to copy by hand.

### Wrapping

The provided CLI is only a wrapper around the exported `generateProject` function.

Other tools can call `generateProject` themselves, to provide a different terminal or graphical UI.

```js
import { generateProject, Project } from 'ember.nvp';


await generateProject(new Project(
    directoryToGenerateIn
    // desires
    {
        name,
        path,
        type,
        layers,
        packageManager,
    }
));
```

All parts of the generator are idempotent, so running generators on existing projects _can_ no-op.

A project from an older blueprint is migrated first.
`generateProject` returns `{ todo }`, the list of what is left for the user.
When the project needs changes before it can migrate, `generateProject` throws a `MigrationError` with a `findings` list, and changes nothing.
`checkMigration(project)` gives the same lists without changing anything, and `formatFindings(findings)` prints them the way the CLI does.

To get the same don't-write-until-confirmed behavior as the CLI, wrap generation in a `Stage`.
A stage is a scratch copy of the target directory (without `node_modules` and `.git`).
Layers run against that copy, and the target directory is untouched until you commit.

```js
import { generateProject, Project, Stage } from "ember.nvp";

const stage = await Stage.create(directoryToGenerateIn);

await generateProject(new Project(stage.directory, { name, path, type, layers, packageManager }));

const changes = await stage.changes(); // [{ path, status: 'added' | 'modified' | 'deleted' }]
console.log(await stage.diff(changes)); // unified diff against the target directory

await stage.commit(); // write the changes to the target directory
// or: await stage.commit(someOfTheChanges)  -- write only an accepted subset
// or: await stage.discard()                 -- throw everything away, touching nothing
```

## Reqs

- node 24+

## What this does?

- Always `"type": "module"`
- Modern, incremental
- Interactive CLI
  - choose your features
- The generators for the different types of projects are never out of date from each other
  - each feature/layer is a mini codemod that has to work within all the other layers.
    eslint, for example, is always derived the same way: "app" and "library" configs can't get out of sync

Good for:

- demos
- reproductions
- existing monorepos
- example integrations with other tools

## Layers

Each layer is a standalone module that adds a feature to your ember project.
Every layer is aware of the other layers.
For example: add github actions first, and linting later. The github actions output is updated.

### 🎯 Minimal (always included)

The base layer, matching the `--minimal` flag from [ember-cli/ember-app-blueprint#49](https://github.com/ember-cli/ember-app-blueprint/pull/49):

- ✅ `"type": "module"` in package.json
- ✅ No @embroider/compat (faster builds)
- ✅ No testing framework (minimal setup)
- ✅ No linting or formatting
- ✅ No ember-welcome-page
- ✅ Vite-based with modern Ember

Perfect for demos, reproductions, and learning!

### Git

Runs `git init` for you.

This layer is enabled by default, _unless_ you run the generator inside a git repo already.
In that case, you have to opt in to git.

### GitHub Actions (optional)

Adds simple GitHub Actions workflow to your project

### 📝 ESLint (optional)

Adds modern ESLint configuration with:

- TypeScript support
- Ember plugin
- Flat config (ESLint 9+)
- Prettier compatibility

Choose a preset:

- `ember` (default): [ember-eslint](https://github.com/NullVoxPopuli/ember-eslint), which follows the official configuration
- `nvp`: [@nullvoxpopuli/eslint-configs](https://github.com/NullVoxPopuli/eslint-configs)

### 🎨 Prettier (optional)

Code formatting with:

- GTS/GJS template support
- Sensible defaults
- Format scripts

### 🧪 QUnit (optional)

- Both co-located tests as well as traditionally located tests with QUnit.
- New Theme: [qunit-theme-ember](https://github.com/IgnaceMaes/qunit-theme-ember)
- Default utilities to help you find why tests are stuck

### ⚡ Vitest (optional)

Super experimental vitest setup using [ember-vitest](https://github.com/NullVoxPopuli/ember-vitest)

### TypeScript (optional, on by default for libraries)

Choose a version:

- `7` (default): native TypeScript 7 and [ember-content-mapper](https://github.com/NullVoxPopuli/ember-content-mapper) for `.gts` and `.gjs`.
  `lint:types` runs `tsc --noEmit --runExternalCode`.
  ESLint keeps TypeScript 6, because typescript-eslint needs its API.
- `6`: TypeScript 6 and Glint's `ember-tsc`.

A TypeScript 6 project moves to 7 when you choose 7.
A TypeScript 7 project stays on 7.

### expect-type (optional)

Type tests for TypeScript libraries with [expect-type](https://github.com/mmkal/expect-type).

- Tests live in `type-tests/`, with their own tsconfig.
- `lint:type-tests` typechecks them, and `lint` runs it too.
- JavaScript projects and apps get nothing.

## Architecture

### How Layers Work

1. **Discovery**: the CLI scans `src/layers/` and imports each `index.js`
2. **Selection**: the user selects which optional layers to include
3. **Execution**: each layer's `run()` function is called in sequence:
   ```js
   await layer.run(project, project.getLayerOptions(layer.name));
   ```
4. **Layer Functions**: inside `run()`, layers use [`ember-apply`](https://ember-apply.pages.dev/) to apply codemods:
   - copy files from the `files/` directory
   - add dependencies / devDependencies to package.json
   - add npm scripts
   - modify package.json metadata
   - etc

### Adding New Layers

To add a new layer, create a new directory in `src/layers/` with:

1. **`index.js`** - Layer definition:

```js
// src/layers/itemizer/index.js
import { packageJson, files } from "ember-apply";
import { join } from "node:path";

export default {
  label: "My Feature",
  hint: "What this feature does",

  // Optional: questions to ask when the layer is selected (see "Layer options")
  options: {
    maxItems: {
      type: "number",
      prompt: "Enter maximum item count:",
      default: 10,
      validate: (val) => (val > 0 ? undefined : "Must be greater than 0"),
    },
  },

  async run(project, { maxItems }) {
    // Copy files from files/ directory
    await files.applyFolder(join(import.meta.dirname, "files"), project.directory);

    await packageJson.addDependencies({ "some-package": "^1.0.0" }, project.directory);

    await packageJson.addScripts(
      { "my-script": `echo "Max items: ${maxItems}"` },
      project.directory,
    );
  },

  // Optionally add something to the README.md file
  readme() {
    return "### My Feature\n\nHere's what my feature brings to the table.";
  },
};
```

2. **`files/`** directory: template files to copy
   - files are copied to the target directory, keeping their structure

The CLI discovers the layer and offers it as an option.

### Layer options

A layer's `options` are questions that the CLI asks after the user selects the layer.
`run(project, options)` receives the answers, with defaults filled in.
`project.getLayerOptions(name)` returns the options of any layer.

Each option needs:

- `type`: `"text"`, `"number"`, `"select"`, `"confirm"`, or `"multiselect"`
- `prompt`: the question, also shown in `--help`
- `options`, for `select` and `multiselect`: the choices, as `{ value, label, hint }`

Each option can also have:

- `default`
- `validate`: the same as [clack's `validate`](https://github.com/bombshell-dev/clack/tree/main/packages/prompts#text).
  A function that returns a message to reject the value, or a [Standard Schema](https://standardschema.dev).
- `detect(project)`: the value that an existing project uses now.
  When updating a project, the question starts at this value instead of `default`.

Each option is also a CLI flag, `--<layer>.<option>`:

```bash
npx ember.nvp --layers eslint-bundled --eslint-bundled.preset nvp
```

- `confirm` options are on with `--<layer>.<option>`, and off with `--no-<layer>.<option>`.
- `multiselect` options take the flag more than once, or a comma-separated list.
- `npx ember.nvp --help` lists every option.
