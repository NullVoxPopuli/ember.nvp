## Development

To work on ember.nvp itself:

```bash
# Clone and setup
git clone <repo-url>
cd ember.nvp
pnpm install

# Test the CLI
node src/cli/index.js

# Or link globally
pnpm link --global
ember.nvp
```

## Testing the Generator

Generate a test project:

```bash
# From the ember.nvp directory
node src/cli/index.js

# Follow the prompts to create "test-app"
# Then test it:
cd test-app
pnpm install
pnpm start
```

## Project Structure

- **src/cli/** - CLI interface using @clack/prompts
- **src/layers/** - Feature layers (auto-discovered)
- **src/lib/** - Shared utilities like the generator

## Contributing

To add a new layer:

1. Create a directory in `src/layers/your-layer/`
2. Add an `index.js` with the layer definition
3. The CLI will automatically discover it!

See [README.md](README.md#adding-new-layers) for the layer schema.
