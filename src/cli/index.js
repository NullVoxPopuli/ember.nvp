#!/usr/bin/env node

import * as p from '@clack/prompts';
import { readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pc from 'picocolors';
import { generateProject } from '../lib/generator.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Discover available layers from the layers directory
 */
async function discoverLayers() {
  const layersDir = join(__dirname, '..', 'layers');
  const entries = await readdir(layersDir, { withFileTypes: true });
  
  const layers = [];
  
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const layerPath = join(layersDir, entry.name, 'index.js');
      try {
        const layer = await import(layerPath);
        layers.push({
          name: entry.name,
          ...layer.default
        });
      } catch (err) {
        // Skip layers that don't have proper exports
        console.warn(`Warning: Could not load layer ${entry.name}:`, err.message);
      }
    }
  }
  
  return layers;
}

async function main() {
  console.clear();

  p.intro(pc.bgCyan(pc.black(' ember.nvp ')));

  const projectName = await p.text({
    message: 'What is your project name?',
    placeholder: 'my-ember-app',
    validate(value) {
      if (value.length === 0) return 'Project name is required';
      if (!/^[a-z0-9-]+$/.test(value)) {
        return 'Project name must be lowercase and can only contain letters, numbers, and hyphens';
      }
    },
  });

  if (p.isCancel(projectName)) {
    p.cancel('Operation cancelled');
    return process.exit(0);
  }

  // Discover available layers
  const layers = await discoverLayers();
  
  // Separate minimal from other layers
  const minimalLayer = layers.find(l => l.name === 'minimal');
  const optionalLayers = layers.filter(l => l.name !== 'minimal');

  p.note(
    `${pc.cyan('minimal')} layer is always included.\n` +
    'It provides: type: "module", no compat, no testing, no linting.\n' +
    'Perfect for demos and reproductions.',
    'Base Layer'
  );

  // Let user select additional features
  const selectedFeatures = await p.multiselect({
    message: 'Select additional features:',
    options: optionalLayers.map(layer => ({
      value: layer.name,
      label: layer.label || layer.name,
      hint: layer.description,
    })),
    required: false,
  });

  if (p.isCancel(selectedFeatures)) {
    p.cancel('Operation cancelled');
    return process.exit(0);
  }

  const packageManager = await p.select({
    message: 'Which package manager?',
    options: [
      { value: 'pnpm', label: 'pnpm', hint: 'Fast, disk space efficient' },
      { value: 'npm', label: 'npm', hint: 'Node default' },
      { value: 'yarn', label: 'yarn', hint: 'Classic alternative' },
    ],
  });

  if (p.isCancel(packageManager)) {
    p.cancel('Operation cancelled');
    return process.exit(0);
  }

  // Build the final configuration
  const selectedLayers = [
    minimalLayer,
    ...optionalLayers.filter(l => selectedFeatures.includes(l.name))
  ].filter(Boolean);

  const s = p.spinner();
  s.start('Creating your Ember app...');

  try {
    // Generate the project
    const projectPath = join(process.cwd(), projectName);
    await generateProject(projectPath, projectName, selectedLayers);
    
    s.stop('Project created!');

    p.note(
      `cd ${projectName}\n` +
      `${packageManager} install\n` +
      `${packageManager} ${packageManager === 'npm' ? 'run ' : ''}start`,
      'Next steps'
    );

    p.outro(
      pc.green('✓') + ' Project ready! ' + pc.dim('Happy coding!')
    );
  } catch (err) {
    s.stop('Failed to create project');
    p.cancel(`Error: ${err.message}`);
    throw err;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
