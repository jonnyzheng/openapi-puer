import { cpSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = resolve(__dirname, 'src', 'webview');
const dest = resolve(__dirname, 'out', 'webview');

if (!existsSync(dest)) {
  mkdirSync(dest, { recursive: true });
}

cpSync(src, dest, { recursive: true });

// Copy prism assets from node_modules if not already present
const prismDest = resolve(dest, 'prism');
const prismSrc = resolve(__dirname, 'node_modules', 'prismjs');
if (existsSync(prismSrc) && !existsSync(prismDest)) {
  mkdirSync(prismDest, { recursive: true });
  cpSync(resolve(prismSrc, 'prism.js'), resolve(prismDest, 'prism.js'));
  cpSync(resolve(prismSrc, 'components'), resolve(prismDest, 'components'), { recursive: true });
  cpSync(resolve(prismSrc, 'themes'), resolve(prismDest, 'themes'), { recursive: true });
}
