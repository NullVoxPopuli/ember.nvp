# Refactoring to ember-apply Architecture

## Summary

Successfully refactored the layer system from a declarative approach (defining dependencies/files as data) to an imperative approach using `ember-apply` utilities (defining a `run()` function that applies changes).

## Key Changes

### 1. Layer Definition Format

**Before:**
```js
export default {
  label: 'My Layer',
  description: 'Description',
  dependencies: { /* ... */ },
  devDependencies: { /* ... */ },
  packageScripts: { /* ... */ },
  files: {
    'path/to/file.js': `content here`,
  }
};
```

**After:**
```js
import { packageJson, files } from 'ember-apply';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default {
  label: 'My Layer',
  description: 'Description',
  
  async run({ targetDir, projectName }) {
    // Apply files from files/ directory
    await files.applyFolder(join(__dirname, 'files'), targetDir);
    
    // Add dependencies
    await packageJson.addDependencies({ /* ... */ }, targetDir);
    await packageJson.addDevDependencies({ /* ... */ }, targetDir);
    
    // Add scripts
    await packageJson.addScripts({ /* ... */ }, targetDir);
  }
};
```

### 2. File Management

**Before:** Files defined as strings in JavaScript
- Inline templates in the layer definition
- Template variable replacement: `{{PROJECT_NAME}}`

**After:** Files in dedicated `files/` directories
- Actual files that can be edited with proper syntax highlighting
- Template variable replacement: `__PROJECT_NAME__`
- Files copied using `ember-apply`'s robust file utilities

### 3. Generator Simplification

**Before:** Complex merging logic in `generator.js`
- Merged dependencies from all layers
- Merged scripts from all layers
- Handled file writing with custom logic
- ~150 lines of code

**After:** Simple orchestration in `generator.js`
- Just calls each layer's `run()` function
- ~18 lines of code
- Layers handle their own merging logic via ember-apply

## Benefits

1. **Better Tooling**: Files are actual files, not strings in JS
   - Syntax highlighting
   - Format on save
   - Git diffs work properly

2. **More Flexible**: Layers can do complex transformations
   - Use `ember-apply`'s powerful utilities
   - Transform existing files (not just add new ones)
   - Conditional logic based on other layers

3. **Cleaner Separation**: Each layer is self-contained
   - All logic in one place
   - No central merging logic needed
   - Easier to test and debug

4. **Extensibility**: Easy to add advanced features
   - Use `js.transform()` for AST transformations
   - Use `packageJson.modify()` for complex package.json updates
   - Use `html.transform()` for HTML modifications

## Files Changed

### Layer Refactors
- ✅ `src/layers/minimal/index.js` - 177 → 81 lines
- ✅ `src/layers/eslint/index.js` - 60 → 37 lines
- ✅ `src/layers/prettier/index.js` - 53 → 33 lines
- ✅ `src/layers/qunit/index.js` - 90 → 45 lines
- ✅ `src/layers/vitest/index.js` - 72 → 41 lines

### New File Structures
- ✅ `src/layers/minimal/files/` - 8 files (app structure, configs)
- ✅ `src/layers/eslint/files/` - 1 file (eslint.config.mjs)
- ✅ `src/layers/prettier/files/` - 2 files (.prettierrc.cjs, .prettierignore)
- ✅ `src/layers/qunit/files/` - 4 files (test setup)
- ✅ `src/layers/vitest/files/` - 4 files (test setup)

### Core Changes
- ✅ `src/lib/generator.js` - 156 → 18 lines (88% reduction!)
- ✅ `package.json` - Added `ember-apply` dependency
- ✅ `README.md` - Updated architecture docs

## Migration Notes

### For Contributors

When adding a new layer:
1. Create `src/layers/your-layer/index.js` with a `run()` function
2. Create `src/layers/your-layer/files/` with template files
3. Use `__PROJECT_NAME__` for project name placeholders
4. Import and use `ember-apply` utilities

### For Users

No changes required - the CLI interface remains identical.

## Testing

```bash
# Install dependencies
pnpm install

# Run the CLI
node src/cli/index.js

# Generate a test project
# Select features, watch it create the project using ember-apply!
```

## Future Enhancements

Now that we're using `ember-apply`, we can easily add:
- File transformations (modify existing files)
- Conditional logic (detect what's already installed)
- Complex AST transformations
- HTML manipulation
- CSS/Tailwind integration
- And more!
