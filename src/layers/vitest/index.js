import { packageJson, files } from 'ember-apply';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Vitest Layer
 * 
 * Adds Vitest testing support (modern, fast alternative to QUnit)
 */
export default {
  label: 'Vitest',
  description: 'Testing with Vitest (modern & fast)',
  
  async run({ targetDir }) {
    // Apply test files
    await files.applyFolder(join(__dirname, 'files'), targetDir);
    
    // Add dependencies
    await packageJson.addDependencies({
      '@ember/test-helpers': '^4.0.4',
    }, targetDir);
    
    // Add devDependencies
    await packageJson.addDevDependencies({
      'vitest': '^2.1.8',
      '@vitest/ui': '^2.1.8',
      'happy-dom': '^15.11.7',
      '@ember/test-waiters': '^3.1.0',
    }, targetDir);
    
    // Add scripts
    await packageJson.addScripts({
      'test': 'vitest run',
      'test:watch': 'vitest',
      'test:ui': 'vitest --ui',
    }, targetDir);
  }
};

