// Persistência das fotos de um imóvel. A ordem é o que define a capa: a foto 0 é a que aparece
// no catálogo, então remover uma foto reindexa as restantes.
import { conectarBanco } from '../../infra/db.js';
import type { RegistroImagem } from './imovel.repositorio.js';

export function contarImagens(imovelId: string): number {
  const linha = conectarBanco()
    .prepare('SELECT COUNT(*) AS total FROM imagens WHERE imovel_id = ?')
    .get(imovelId) as { total: number };

  return linha.total;
}

export function inserirImagem(imagem: {
  id: string;
  imovelId: string;
  url: string;
  alt: string;
  ordem: number;
  criadoEm: string;
}): void {
  conectarBanco()
    .prepare('INSERT INTO imagens (id, imovel_id, url, alt, ordem, criado_em) VALUES (?, ?, ?, ?, ?, ?)')
    .run(imagem.id, imagem.imovelId, imagem.url, imagem.alt, imagem.ordem, imagem.criadoEm);
}

export function buscarImagem(imovelId: string, imagemId: string): RegistroImagem | null {
  const linha = conectarBanco()
    .prepare('SELECT id, url, alt, ordem FROM imagens WHERE id = ? AND imovel_id = ?')
    .get(imagemId, imovelId) as RegistroImagem | undefined;

  return linha ?? null;
}

export function removerImagem(imovelId: string, imagemId: string): void {
  const db = conectarBanco();
  db.prepare('DELETE FROM imagens WHERE id = ? AND imovel_id = ?').run(imagemId, imovelId);

  const restantes = db
    .prepare('SELECT id FROM imagens WHERE imovel_id = ? ORDER BY ordem ASC, id ASC')
    .all(imovelId) as { id: string }[];

  const reindexar = db.prepare('UPDATE imagens SET ordem = ? WHERE id = ?');
  restantes.forEach((linha, indice) => {
    reindexar.run(indice, linha.id);
  });
}
