import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const configPath = resolve(scriptDir, '../ios/App/App/capacitor.config.json');
const moduleQualifiedPlugin = 'NativePurchasesPlugin.NativePurchasesPlugin';
const fallbackPlugin = 'NativePurchasesPlugin';

const config = JSON.parse(await readFile(configPath, 'utf8'));
const packageClassList = Array.isArray(config.packageClassList) ? config.packageClassList : [];
const withoutDuplicates = packageClassList.filter((plugin) => plugin !== moduleQualifiedPlugin && plugin !== fallbackPlugin);

config.packageClassList = [moduleQualifiedPlugin, fallbackPlugin, ...withoutDuplicates];

await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
console.info('Patched iOS Capacitor plugin class list for NativePurchases.');
