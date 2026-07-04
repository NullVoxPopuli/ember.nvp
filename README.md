# ember.nvp

_ember project generator: a reenvisioning of blueprints -- hopefully one day to upstream back in to ember-cli / official blueprints, **if** all the caveats can be cleaned up_

> [!NOTE]
> **Why isn't this work happening in the default blueprints?** for a long time now, I've felt the old blueprint system from the very early days of ember-cli has not allowed for expressive enough layering of what people actually want out of a project generator. That said, that means there are some compromises in the CLI/generator in this repo. Throughout all files generated, whenever there is a caveat, there will be a comment in the file with the caveat, explaining status, open issues, and how we can collectively move forward. It's possible that one day ember-cli adopts or is inspired by this project, but it's too early to tell at the moment.

_I can't recommend using this tool unless your comfortable with the emitted caveats in the project_.
(And being comfortable debugging build issues is recommended)

But I'm very excited about this tool, because it's everything I've ever wanted from a project generator. Each layer is idempotent, and knows about the other layers. So if, for example, you omit eslint when setting up your project, but do have github-actions, when you do add eslint, your github-actions will be updated as well. And this works in any order.

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

You can run `ember.nvp` on top of an existing project to add layers to it. Generation never writes directly to your project -- everything runs in a staging directory first, and before finishing you choose to:

- **write the files** -- apply all of the staged changes
- **review the diff** -- step through each changed file's diff, accepting or rejecting it individually (or accept/reject everything remaining)
- **cancel** -- discard everything; your project is untouched

Only files that actually changed are written. `node_modules`, `.git`, and everything else in your project are left alone, and the accepted changes land as uncommitted edits for you to review with your own git tooling.

New projects skip the confirmation and are written as soon as generation succeeds. For scripting, `--write yes` / `--write no` answers the confirmation up front.

### Wrapping

The provided CLI is only a wrapper around our exported `generateProject` function.

Other tools can call `generateProject` themselves if they wish to provide a different terminal or graphical UI.

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

To get the same don't-write-until-confirmed behavior as the CLI, wrap generation in a `Stage`. A stage is a real directory in the OS temp dir, seeded with a copy of the target directory's current contents (sans `node_modules`/`.git`) -- so layers run against the project's existing state with plain `node:fs`, `ember-apply`, and subprocesses, and authoring a layer is exactly the same with or without one.

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
- The generators fro the different types of projects are never out of date from each other
  - each feature/layer is a mini codemod that has to support working within all the other layers -- so eslint for example is always derived the same way -- no way for "app" and "library" configs to get out of sync

Good for:

- demos
- reproductions
- existing monorepos
- example integrations with other tools

## Layers

Each layer is a standalone module that can add features to your ember project,
and every layer is aware of the other layers, so if, for example, you run github actions first, and then later decide to add linting, the github actions output will be updated.

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

By default this layer is enabled, _unless_ you are running the generator in a git repo already -- then you have to opt in to git.

### GitHub Actions (optional)

Adds simple GitHub Actions workflow to your project

### 📝 ESLint (optional)

Adds modern ESLint configuration with:

- TypeScript support
- Ember plugin
- Flat config (ESLint 9+)
- Prettier compatibility

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

## Architecture

### How Layers Work

1. **Discovery**: CLI scans `src/layers/` and imports each `index.js`
2. **Selection**: User selects which optional layers to include
3. **Execution**: Each layer's `run()` function is called in sequence:
   ```js
   await layer.run(project);
   ```
4. **Layer Functions**: Inside `run()`, layers use [`ember-apply`](https://ember-apply.pages.dev/) to apply codemods in order to:
   - Copy files from `files/` directory
   - Add dependencies/devDependencies to package.json
   - Add npm scripts
   - Modify package.json metadata
   - etc

### Adding New Layers

To add a new layer, create a new directory in `src/layers/` with:

1. **`index.js`** - Layer definition:

```js
import { packageJson, files } from "ember-apply";
import { join } from "node:path";

export default {
  label: "My Feature",
  description: "What this feature does",

  async run(project) {
    // Copy files from files/ directory
    await files.applyFolder(join(import.meta.dirname, "files"), project.directory);

    await packageJson.addDependencies({ "some-package": "^1.0.0" }, project.directory);

    await packageJson.addScripts({ "my-script": 'echo "Hello"' }, project.directory);
  },
};
```

2. **`files/`** directory - Template files to copy:
   - Files will be copied to the target directory maintaining structure

The CLI will automatically discover and offer it as an option!
