import { copyFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const webDir = join(projectRoot, 'www');
const webFiles = ['index.html', 'style.css', 'app.js', 'energy.js', 'cultivo-models.js', 'cultivo-db.js', 'cultivation.js', 'products.js', 'recipes.js'];

await mkdir(webDir, { recursive: true });
await Promise.all(webFiles.map(file => copyFile(join(projectRoot, file), join(webDir, file))));
console.log(`Assets web sincronizados en ${webDir}`);
