import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Stage only playable assets; source notes and tests are not served by the Site.
const root = new URL('../', import.meta.url);
const output = new URL('dist/', root);
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
for (const file of ['index.html', 'styles.css', 'engine.js', 'renderer.js', 'game.js']) {
  copyFileSync(new URL(file, root), new URL(file, output));
}
console.log(`Staged Space Attack at ${fileURLToPath(output)}`);
