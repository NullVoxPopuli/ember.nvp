import { packageJson, files } from 'ember-apply';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Prettier Layer
 * 
 * Adds Prettier for code formatting
 */
export default {
  label: 'Prettier',
  description: 'Code formatting with Prettier',
  
  async run({ targetDir }) {
    // Apply config files
    await files.applyFolder(join(__dirname, 'files'), targetDir);
    
    // Add devDependencies
    await packageJson.addDevDependencies({
      'prettier': '^3.4.2',
      'prettier-plugin-ember-template-tag': '^2.0.2',
    }, targetDir);
    
    // Add scripts
    await packageJson.addScripts({
      'format': 'prettier --write .',
      'format:check': 'prettier --check .',
    }, targetDir);
  }
};

