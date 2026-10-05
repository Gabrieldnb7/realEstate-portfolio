// Persistência do catálogo: SQL escrito à mão sobre better-sqlite3.
// A leitura devolve registros (rascunho pode estar incompleto); a escrita só acontece a
// partir do agregado Imovel, que já passou pelas regras do catálogo.
import { conectarBanco } from '../../infra/db.js';
import { Apartamento, Estate, Penthouse, Villa } from '../../entities/index.js';
import type { Imovel, SituacaoImovel, Tipologia } from '../../entities/index.js';
import type { Praca, PrecoVo } from '../../entities/index.js';

export interface RegistroImagem {
  id: string;
  url: string;
  alt: string;
  ordem: number;
}

export interface DetalhesTecnicos {
  tipologia: Tipologia;
  areaPrivativa: string | null;
  areaConstruida: string | null;
  areaTerreno: string | null;
  andar: number | null;
}

export interface RegistroImovel extends DetalhesTecnicos {
  id: string;
  ref: string;
  slug: string;
  titulo: string;
  pais: Praca;
  cidade: string;
  bairro: string;
  descricao: string;
  preco: PrecoVo | null;
  quartos: number;
  banheiros: number | null;
  vagas: number | null;
  parceiro: string;
  situacao: SituacaoImovel;
  criadoEm: string;
  atualizadoEm: string;
  imagens: RegistroImagem[];
}

export interface ResumoPainel {
  id: string;
  ref: string;
  slug: string;
  titulo: string;
  tipologia: Tipologia;
  pais: Praca;
  cidade: string;
  bairro: string;
  preco: PrecoVo | null;
  situacao: SituacaoImovel;
  atualizadoEm: string;
  totalFotos: number;
  fotosSemDescricao: number;
}

interface LinhaImovel {
  id: string;
  ref: string;
  slug: string;
  titulo: string;
  tipologia: string;
  pais: string;
  cidade: string;
  bairro: string;
  descricao: string;
  preco_valor: string | null;
  preco_moeda: string | null;
  area_privativa: string | null;
  area_construida: string | null;
  area_terreno: string | null;
  quartos: number;
  banheiros: number | null;
  vagas: number | null;
  andar: number | null;
  parceiro: string;
  situacao: string;
  criado_em: string;
  atualizado_em: string;
}

function precoDaLinha(linha: LinhaImovel): PrecoVo | null {
  if (linha.preco_valor === null || linha.preco_moeda === null) return null;
  return { valor: linha.preco_valor, moeda: linha.preco_moeda as PrecoVo['moeda'] };
}

function detalhesDaLinha(linha: LinhaImovel): DetalhesTecnicos {
  return {
    tipologia: linha.tipologia as Tipologia,
    areaPrivativa: linha.area_privativa,
    areaConstruida: linha.area_construida,
    areaTerreno: linha.area_terreno,
    andar: linha.andar,
  };
}

export function extrairDetalhesTecnicos(imovel: Imovel): DetalhesTecnicos {
  if (imovel instanceof Apartamento || imovel instanceof Penthouse) {
    return {
      tipologia: imovel.tipologia,
      areaPrivativa: imovel.areaPrivativa === '' ? null : imovel.areaPrivativa,
      areaConstruida: null,
      areaTerreno: null,
      andar: Number.isInteger(imovel.andar) ? imovel.andar : null,
    };
  }

  if (imovel instanceof Villa || imovel instanceof Estate) {
    return {
      tipologia: imovel.tipologia,
      areaPrivativa: null,
      areaConstruida: imovel.areaConstruida === '' ? null : imovel.areaConstruida,
      areaTerreno: imovel.areaTerreno === '' ? null : imovel.areaTerreno,
      andar: null,
    };
  }

  return {
    tipologia: imovel.tipologia,
    areaPrivativa: null,
    areaConstruida: null,
    areaTerreno: null,
    andar: null,
  };
}

export function listarResumos(): ResumoPainel[] {
  const linhas = conectarBanco()
    .prepare(
      `SELECT i.id, i.ref, i.slug, i.titulo, i.tipologia, i.pais, i.cidade, i.bairro,
              i.preco_valor, i.preco_moeda, i.situacao, i.atualizado_em,
              COUNT(g.id) AS total_fotos,
              SUM(CASE WHEN TRIM(g.alt) = '' THEN 1 ELSE 0 END) AS fotos_sem_descricao
       FROM imoveis i
       LEFT JOIN imagens g ON g.imovel_id = i.id
       GROUP BY i.id
       ORDER BY i.atualizado_em DESC, i.ref ASC`
    )
    .all() as (LinhaImovel & {
    total_fotos: number;
    fotos_sem_descricao: number | null;
  })[];

  return linhas.map((linha) => ({
    id: linha.id,
    ref: linha.ref,
    slug: linha.slug,
    titulo: linha.titulo,
    tipologia: linha.tipologia as Tipologia,
    pais: linha.pais as Praca,
    cidade: linha.cidade,
    bairro: linha.bairro,
    preco: precoDaLinha(linha),
    situacao: linha.situacao as SituacaoImovel,
    atualizadoEm: linha.atualizado_em,
    totalFotos: linha.total_fotos,
    fotosSemDescricao: linha.fotos_sem_descricao ?? 0,
  }));
}

export function buscarRegistro(id: string): RegistroImovel | null {
  const db = conectarBanco();

  const linha = db.prepare('SELECT * FROM imoveis WHERE id = ?').get(id) as LinhaImovel | undefined;
  if (!linha) return null;

  const imagens = db
    .prepare('SELECT id, url, alt, ordem FROM imagens WHERE imovel_id = ? ORDER BY ordem ASC, id ASC')
    .all(id) as RegistroImagem[];

  return {
    id: linha.id,
    ref: linha.ref,
    slug: linha.slug,
    ...detalhesDaLinha(linha),
    titulo: linha.titulo,
    pais: linha.pais as Praca,
    cidade: linha.cidade,
    bairro: linha.bairro,
    descricao: linha.descricao,
    preco: precoDaLinha(linha),
    quartos: linha.quartos,
    banheiros: linha.banheiros,
    vagas: linha.vagas,
    parceiro: linha.parceiro,
    situacao: linha.situacao as SituacaoImovel,
    criadoEm: linha.criado_em,
    atualizadoEm: linha.atualizado_em,
    imagens,
  };
}

export function imovelExiste(id: string): boolean {
  const linha = conectarBanco().prepare('SELECT id FROM imoveis WHERE id = ?').get(id) as
    | { id: string }
    | undefined;

  return linha !== undefined;
}

export function existeReferencia(ref: string, ignorarId?: string): boolean {
  const linha = conectarBanco()
    .prepare('SELECT id FROM imoveis WHERE ref = ? AND id <> ?')
    .get(ref, ignorarId ?? '') as { id: string } | undefined;

  return linha !== undefined;
}

export function slugEmUso(slug: string, ignorarId?: string): boolean {
  const linha = conectarBanco()
    .prepare('SELECT id FROM imoveis WHERE slug = ? AND id <> ?')
    .get(slug, ignorarId ?? '') as { id: string } | undefined;

  return linha !== undefined;
}

function valoresComuns(imovel: Imovel): (string | number | null)[] {
  const detalhes = extrairDetalhesTecnicos(imovel);

  return [
    imovel.ref,
    imovel.slug,
    imovel.titulo,
    imovel.tipologia,
    imovel.pais,
    imovel.cidade,
    imovel.bairro,
    imovel.descricao,
    imovel.preco?.valor ?? null,
    imovel.preco?.moeda ?? null,
    detalhes.areaPrivativa,
    detalhes.areaConstruida,
    detalhes.areaTerreno,
    imovel.quartos,
    imovel.banheiros,
    imovel.vagas,
    detalhes.andar,
    imovel.parceiro,
    imovel.situacao,
  ];
}

function identidade(imovel: Imovel): string {
  if (!imovel.id) throw new Error('imovel sem id para persistir');
  return imovel.id;
}

export function inserirImovel(imovel: Imovel, agora: string): void {
  conectarBanco()
    .prepare(
      `INSERT INTO imoveis (
         id, ref, slug, titulo, tipologia, pais, cidade, bairro, descricao,
         preco_valor, preco_moeda, area_privativa, area_construida, area_terreno,
         quartos, banheiros, vagas, andar, parceiro, situacao, criado_em, atualizado_em
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(identidade(imovel), ...valoresComuns(imovel), agora, agora);
}

export function atualizarImovel(imovel: Imovel, agora: string): void {
  conectarBanco()
    .prepare(
      `UPDATE imoveis SET
         ref = ?, slug = ?, titulo = ?, tipologia = ?, pais = ?, cidade = ?, bairro = ?, descricao = ?,
         preco_valor = ?, preco_moeda = ?, area_privativa = ?, area_construida = ?, area_terreno = ?,
         quartos = ?, banheiros = ?, vagas = ?, andar = ?, parceiro = ?, situacao = ?, atualizado_em = ?
       WHERE id = ?`
    )
    .run(...valoresComuns(imovel), agora, identidade(imovel));
}

export function salvarSituacao(id: string, situacao: SituacaoImovel, agora: string): void {
  conectarBanco().prepare('UPDATE imoveis SET situacao = ?, atualizado_em = ? WHERE id = ?').run(
    situacao,
    agora,
    id
  );
}

// Anexo C: só vai ao ar com pelo menos uma foto e com a descrição de todas as fotos.
export function temFotosValidasParaPublicacao(imovelId: string): boolean {
  const contagem = conectarBanco()
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN TRIM(alt) = '' THEN 1 ELSE 0 END) AS sem_descricao
       FROM imagens WHERE imovel_id = ?`
    )
    .get(imovelId) as { total: number; sem_descricao: number | null };

  return contagem.total >= 1 && (contagem.sem_descricao ?? 0) === 0;
}
