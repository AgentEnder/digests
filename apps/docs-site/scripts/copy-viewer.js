import { copyFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = resolve(__dirname, '../../html-viewer/dist/index.html');
const destDir = resolve(__dirname, '../public/viewer');
const dest = resolve(destDir, 'app.html');

import { existsSync } from 'node:fs';

if (!existsSync(src)) {
  console.error(`[copy-viewer] html-viewer not built. Run: npx nx build @digests/html-viewer`);
  process.exit(1);
}

mkdirSync(destDir, { recursive: true });
copyFileSync(src, dest);
console.log(`[copy-viewer] Copied html-viewer to ${dest}`);
