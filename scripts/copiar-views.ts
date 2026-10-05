import { cpSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(fileURLToPath(import.meta.url), '..', '..');
const origem = path.join(raiz, 'src', 'views');
const destino = path.join(raiz, 'dist', 'views');

rmSync(destino, { recursive: true, force: true });
mkdirSync(path.dirname(destino), { recursive: true });
cpSync(origem, destino, { recursive: true });

console.log(`[build] templates copiados para ${destino}`);
