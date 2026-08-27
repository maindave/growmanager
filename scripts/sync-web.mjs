import { copyFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const webDir = join(projectRoot, 'www');
const webFiles = ['index.html', 'style.css', 'app.js', 'energy.js', 'supabase-config.js', 'supabase-client.js', 'auth.js', 'cultivo-models.js', 'cultivo-db.js', 'cultivo-repository.js', 'cultivo-migration.js', 'cultivation.js', 'products.js', 'recipes.js', 'workspaces.js', 'agenda.js'];
const vendorDir = join(webDir, 'vendor');

await mkdir(webDir, { recursive: true });
await mkdir(vendorDir, { recursive: true });
await Promise.all(webFiles.map(file => copyFile(join(projectRoot, file), join(webDir, file))));
await copyFile(join(projectRoot, 'node_modules', '@supabase', 'supabase-js', 'dist', 'umd', 'supabase.js'), join(vendorDir, 'supabase.js'));
console.log(`Assets web sincronizados en ${webDir}`);
