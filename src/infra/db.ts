import Database, { type Database as DatabaseType } from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

let instanciaDb: DatabaseType | null = null;

export function obterCaminhoBanco(): string {
  const caminhoEnv = process.env.DB_PATH ?? process.env.DATABASE_URL?.replace(/^file:/, '');
  if (caminhoEnv && caminhoEnv.trim() !== '') {
    return resolve(caminhoEnv.trim());
  }
  return resolve('./dados/banco.sqlite');
}

export function conectarBanco(caminhoPersonalizado?: string): DatabaseType {
  if (instanciaDb && !caminhoPersonalizado) {
    return instanciaDb;
  }

  const caminho = caminhoPersonalizado ?? obterCaminhoBanco();
  mkdirSync(dirname(caminho), { recursive: true });

  const db = new Database(caminho);

  // Configurações de alta concorrência e integridade (Anexo F)
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');

  if (!caminhoPersonalizado) {
    instanciaDb = db;
  }

  return db;
}

export function fecharBanco(): void {
  if (instanciaDb) {
    instanciaDb.close();
    instanciaDb = null;
  }
}
