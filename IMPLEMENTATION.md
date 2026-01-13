# ember.nvp Implementation Summary

## What Was Built

A highly interactive CLI for generating modern Ember.js applications with a layered architecture that allows users to select exactly which features they want.

## Key Features

### 1. Interactive CLI
- Built with `@clack/prompts` for a beautiful terminal UI
- Project name validation
- Multi-select feature selection
- Package manager choice (pnpm, npm, yarn)
- Auto-discovery of available layers

### 2. Layer System
Each layer is a self-contained module that defines:
- **dependencies** - Runtime npm packages
- **devDependencies** - Development npm packages  
- **packageScripts** - npm scripts to add
- **files** - File templates to generate

Layers are automatically discovered from `src/layers/` directory.

### 3. Implemented Layers

#### Minimal (base - always included)
Based on the `--minimal` flag from ember-cli/ember-app-blueprint#49:
- `type: "module"` in package.json
- Vite build system
- No @embroider/compat
- No testing, linting, or formatting
- Modern Ember with GTS/GJS support
- TypeScript configuration

#### ESLint
- Modern flat config (ESLint 9+)
- TypeScript support
- Ember plugin
- Prettier compatibility

#### Prettier
- Code formatting
- GTS/GJS template tag support
- Format scripts

#### QUnit
- Traditional Ember testing
- Playwright integration for CI
- Test helper setup

#### Vitest
- Modern, fast testing alternative
- Watch mode & UI
- Happy DOM environment

## Architecture

```
ember.nvp/
├── src/
│   ├── cli/
│   │   └── index.js          # Main CLI entry point
│   ├── layers/                # Feature layers (auto-discovered)
│   │   ├── minimal/
│   │   ├── eslint/
│   │   ├── prettier/
│   │   ├── qunit/
│   │   └── vitest/
│   └── lib/
│       └── generator.js      # Project generation logic
├── package.json              # Defines bin commands
└── README.md                 # Documentation
```

## How It Works

1. **Layer Discovery**: CLI scans `src/layers/` and imports each layer's `index.js`
2. **User Interaction**: Prompts user for project name, features, and package manager
3. **Layer Merging**: Combines dependencies, scripts, and files from selected layers
4. **Project Generation**: Creates project directory with all merged files
5. **Template Variables**: Replaces `{{PROJECT_NAME}}` in all generated files

## Usage Flow

```bash
# Install dependencies
pnpm install

# Run the generator
node src/cli/index.js

# Answer prompts:
# 1. Project name: "my-app"
# 2. Features: Select from ESLint, Prettier, QUnit, Vitest
# 3. Package manager: pnpm, npm, or yarn

# Generated project structure:
my-app/
├── app/
│   ├── app.ts
│   ├── config.ts
│   ├── router.ts
│   └── templates/
│       └── application.gts
├── tests/ (if testing layer selected)
├── package.json
├── tsconfig.json
├── vite.config.mjs
└── index.html
```

## Extensibility

Adding a new layer is simple:

```javascript
// src/layers/my-feature/index.js
export default {
  label: 'My Feature',
  description: 'What it does',
  dependencies: { /* ... */ },
  devDependencies: { /* ... */ },
  packageScripts: { /* ... */ },
  files: { /* ... */ }
};
```

The CLI automatically discovers and presents it as an option!

## Benefits

1. **Minimal by Default**: No bloat, perfect for demos and reproductions
2. **Choose Your Tools**: Select only the features you need
3. **Modern**: Always uses latest Ember best practices
4. **Type-Safe**: TypeScript and modern tooling throughout
5. **Fast**: Vite-based builds, no legacy compatibility layers
6. **Extensible**: Easy to add new layers

## Future Enhancements

Potential additions:
- GitHub Actions/CI layer
- Tailwind CSS layer
- Component library layers (e.g., ember-primitives)
- Deployment configuration layers (Netlify, Vercel, etc.)
- Storybook layer
- Animation library layers
- State management layers

## Alignment with ember-cli/ember-app-blueprint

The minimal layer matches the structure defined in:
https://github.com/ember-cli/ember-app-blueprint/pull/49

This ensures compatibility and provides a migration path for upstreaming features back to the official blueprints.
