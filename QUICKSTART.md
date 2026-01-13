# ember.nvp Quick Start Guide

## Installation

```bash
cd ember.nvp
pnpm install
```

## Create Your First App

```bash
node src/cli/index.js
```

You'll be prompted to:

1. **Name your project** (e.g., `my-ember-app`)
2. **Select features:**
   - [ ] ESLint - Modern linting
   - [ ] Prettier - Code formatting  
   - [ ] QUnit - Traditional testing
   - [ ] Vitest - Fast modern testing
3. **Choose package manager:** pnpm, npm, or yarn

## What Gets Generated

### With Minimal Only (default)
```
my-ember-app/
├── app/
│   ├── app.ts                # App entry point
│   ├── config.ts             # Configuration
│   ├── router.ts             # Router setup
│   ├── templates/
│   │   └── application.gts   # Root template
│   └── .gitkeep files        # Empty dirs
├── index.html                # HTML entry
├── package.json              # Dependencies
├── tsconfig.json             # TypeScript config
├── vite.config.mjs           # Vite bundler
└── .gitignore
```

### With ESLint + Prettier
Adds:
- `eslint.config.mjs`
- `.prettierrc.cjs`
- `.prettierignore`
- Lint/format scripts in package.json

### With Testing (QUnit or Vitest)
Adds:
- `tests/` directory
- `tests/test-helper.ts`
- `tests/index.html` (QUnit only)
- Test configuration files
- Test scripts in package.json

## After Generation

```bash
cd my-ember-app
pnpm install
pnpm start
```

Your app will be running at `http://localhost:5173` 🚀

## Available Scripts

The generated package.json includes:

```json
{
  "scripts": {
    "start": "vite",
    "build": "vite build",
    "preview": "vite preview",
    // If ESLint selected:
    "lint": "eslint . --cache",
    "lint:fix": "eslint . --fix",
    // If Prettier selected:
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    // If QUnit selected:
    "test": "vite build && node ./run-tests.mjs",
    // If Vitest selected:
    "test": "vitest run",
    "test:watch": "vitest",
    "test:ui": "vitest --ui"
  }
}
```

## Layer Details

### 🎯 Minimal (always included)

**What it provides:**
- Modern Ember 6.x
- Vite for lightning-fast builds
- TypeScript support
- GTS/GJS template format support
- No legacy compatibility layer
- No testing or linting (add those separately if needed)

**Best for:**
- Quick demos
- Bug reproductions
- Learning Ember
- Prototypes

### 📝 ESLint

**Adds:**
- ESLint 9 with flat config
- TypeScript linting
- Ember-specific rules
- Prettier integration (if both selected)

### 🎨 Prettier

**Adds:**
- Automatic code formatting
- GTS/GJS template support
- Format on save (with editor integration)

### 🧪 QUnit

**Adds:**
- QUnit test framework
- Ember test helpers
- Playwright for headless testing
- Test runner script

### ⚡ Vitest

**Adds:**
- Vitest (faster than QUnit)
- Ember test helpers
- Watch mode for TDD
- Beautiful UI mode
- Happy DOM environment

## Tips

### Multiple Projects

Generate as many projects as you need:

```bash
node src/cli/index.js  # Creates project-1
node src/cli/index.js  # Creates project-2
```

### Customize Layers

Edit files in `src/layers/` to customize defaults or add new features!

### Global Installation

```bash
pnpm link --global
# Now use anywhere:
ember.nvp
```

## Examples

### Minimal Demo App
```bash
# Project name: demo-app
# Features: none selected
# Package manager: pnpm
```
Perfect for trying out a new Ember feature!

### Full-Featured App
```bash
# Project name: production-app
# Features: ✓ ESLint, ✓ Prettier, ✓ Vitest
# Package manager: pnpm
```
Ready for production development!

### Testing-Only Setup
```bash
# Project name: test-harness
# Features: ✓ QUnit (or Vitest)
# Package manager: npm
```
Great for addon testing!

## Troubleshooting

**CLI doesn't start?**
```bash
# Make sure dependencies are installed
pnpm install
```

**Generated project has errors?**
```bash
# Make sure to install dependencies in the generated project
cd my-ember-app
pnpm install
```

**Want to change features after generation?**
The layers are designed to be non-destructive. You can manually add configuration files from other layers if needed.

## Learn More

- [README.md](README.md) - Full documentation
- [IMPLEMENTATION.md](IMPLEMENTATION.md) - Technical details
- [CONTRIBUTING.md](CONTRIBUTING.md) - How to add layers
