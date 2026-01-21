# ember.nvp

_ember project generator: alternative to the official blueprints, but more modern -- hopefully one day to upstream back in to ember-cli / official blueprints_

## Reqs

- node 24+

## What this does?

- Always `"type": "module"`
- Interactive CLI
  - choose your features

Good for:

- demos
- reproductions
- existing monorepos
- example integrations with other tools

## Usage

Install dependencies first:

```bash
pnpm install
```

Then run the interactive CLI:

```bash
node src/cli/index.js
```

Or link it locally for easier testing:

```bash
pnpm link --global
ember.nvp
```

### Example Session

```
┌  ember.nvp
│
◆  What is your project name?
│  my-awesome-app
│
◇  Base Layer
│  minimal layer is always included.
│  It provides: type: "module", no compat, no testing, no linting.
│  Perfect for demos and reproductions.
│
◆  Select additional features: (press space to select)
│  ◻ ESLint - Code linting with ESLint
│  ◻ Prettier - Code formatting with Prettier
│  ◻ QUnit - Testing with QUnit
│  ◻ Vitest - Testing with Vitest (modern & fast)
│
◆  Which package manager?
│  ● pnpm - Fast, disk space efficient
│    npm - Node default
│    yarn - Classic alternative
│
◇  Project created!
│
◇  Next steps
│  cd my-awesome-app
│  pnpm install
│  pnpm start
│
└  ✓ Project ready! Happy coding!
```

The CLI will guide you through:

1. **Project name** - Choose your project name
2. **Feature selection** - Select which layers you want (linting, testing, formatting)
3. **Package manager** - Choose pnpm, npm, or yarn

## Layers

Each layer is a standalone module that can add features to your ember project:

### 🎯 Minimal (always included)

The base layer, matching the `--minimal` flag from [ember-cli/ember-app-blueprint#49](https://github.com/ember-cli/ember-app-blueprint/pull/49):

- ✅ `"type": "module"` in package.json
- ✅ No @embroider/compat (faster builds)
- ✅ No testing framework (minimal setup)
- ✅ No linting or formatting
- ✅ No ember-welcome-page
- ✅ Vite-based with modern Ember

Perfect for demos, reproductions, and learning!

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

Traditional Ember testing with:

- QUnit test framework
- @ember/test-helpers
- Test HTML setup
- Playwright for CI

### ⚡ Vitest (optional)

Modern testing alternative:

- Vitest (faster than QUnit)
- @ember/test-helpers
- Happy DOM
- Watch mode & UI

## Architecture

```
src/
├── cli/          # Interactive CLI entry point
│   └── index.js  # Main CLI with prompts
├── layers/       # Feature layers (auto-discovered)
│   ├── minimal/  # Base layer (always included)
│   │   ├── index.js    # Layer definition with run function
│   │   └── files/      # Template files to copy
│   ├── eslint/
│   │   ├── index.js
│   │   └── files/
│   ├── prettier/
│   │   ├── index.js
│   │   └── files/
│   ├── qunit/
│   │   ├── index.js
│   │   └── files/
│   └── vitest/
│       ├── index.js
│       └── files/
└── lib/          # Shared utilities
    └── generator.js  # Project generation orchestration
```

### Layer Architecture

Each layer now uses **ember-apply** utilities for robust file and package.json manipulation:

- **`index.js`** - Exports an object with:
  - `label` - Display name
  - `description` - Short description
  - `run({ targetDir, projectName })` - Async function that applies the layer

- **`files/`** - Directory containing template files to copy to the target project
  - Use `__PROJECT_NAME__` placeholder for project name substitution
  - Files are copied using `ember-apply`'s `files.applyFolder()`

### How Layers Work

1. **Discovery**: CLI scans `src/layers/` and imports each `index.js`
2. **Selection**: User selects which optional layers to include
3. **Execution**: Each layer's `run()` function is called in sequence:
   ```js
   await layer.run({ targetDir: "/path/to/project", projectName: "my-app" });
   ```
4. **Layer Functions**: Inside `run()`, layers use `ember-apply` to:
   - Copy files from `files/` directory
   - Add dependencies/devDependencies to package.json
   - Add npm scripts
   - Modify package.json metadata
   - Transform existing files (e.g., replace placeholders)

### Adding New Layers

To add a new layer, create a new directory in `src/layers/` with:

1. **`index.js`** - Layer definition:

```js
import { packageJson, files } from "ember-apply";
import { join } from "node:path";

export default {
  label: "My Feature",
  description: "What this feature does",

  async run({ targetDir, projectName }) {
    // Copy files from files/ directory
    await files.applyFolder(join(import.meta.dirname, "files"), targetDir);

    // Add dependencies
    await packageJson.addDependencies(
      {
        "some-package": "^1.0.0",
      },
      targetDir,
    );

    // Add devDependencies
    await packageJson.addDevDependencies(
      {
        "dev-package": "^2.0.0",
      },
      targetDir,
    );

    // Add scripts
    await packageJson.addScripts(
      {
        "my-script": 'echo "Hello"',
      },
      targetDir,
    );
  },
};
```

2. **`files/`** directory - Template files to copy:
   - Use `__PROJECT_NAME__` as a placeholder for the project name
   - Files will be copied to the target directory maintaining structure

The CLI will automatically discover and offer it as an option!
