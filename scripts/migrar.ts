import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { conectarBanco, fecharBanco } from '../src/infra/db.js';

export function executarMigracoes(caminhoPersonalizado?: string): string[] {
  const db = conectarBanco(caminhoPersonalizado);
  const pastaMigracoes = fileURLToPath(new URL('../migracoes', import.meta.url));

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migracoes (
      id TEXT PRIMARY KEY,
      aplicada_em TEXT NOT NULL
    )
  `);

  const feitas = new Set(
    (db.prepare('SELECT id FROM schema_migracoes').all() as { id: string }[]).map((linha) => linha.id)
  );

  const arquivos = readdirSync(pastaMigracoes)
    .filter((arquivo) => /^\d{4}_[a-z0-9_]+\.sql$/.test(arquivo) && !feitas.has(arquivo))
    .sort();

  for (const arquivo of arquivos) {
    const conteudoSql = readFileSync(join(pastaMigracoes, arquivo), 'utf8');

    const aplicar = db.transaction(() => {
      db.exec(conteudoSql);
      db.prepare('INSERT INTO schema_migracoes (id, aplicada_em) VALUES (?, ?)').run(
        arquivo,
        new Date().toISOString()
      );
    });

    try {
      aplicar();
      console.log(`[migrações] Aplicada com sucesso: ${arquivo}`);
    } catch (erro) {
      console.error(`[migrações] Falha crítica ao aplicar ${arquivo}:`, erro);
      throw erro;
    }
  }

  return arquivos;
}

// Execução direta via CLI
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const aplicadas = executarMigracoes();
    console.log(aplicadas.length > 0 ? `Total aplicadas: ${aplicadas.length}` : 'Nenhuma migração pendente.');
  } finally {
    fecharBanco();
  }
}
