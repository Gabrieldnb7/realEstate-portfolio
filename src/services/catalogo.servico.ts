// Catálogo público (Anexo D, seção 4). A listagem só mostra o que pode ir ao ar, e quem decide
// o que entra no ar é o painel, pela situação do imóvel.
import { PRACAS_VALIDAS } from '../entities/index.js';
import type { Praca } from '../entities/index.js';
import { listarParaCatalogo } from '../repositories/imoveis/imovel.repositorio.js';
import type { ItemCatalogo, OrdenacaoCatalogo } from '../repositories/imoveis/imovel.repositorio.js';

export const ORDENACOES_VALIDAS: readonly OrdenacaoCatalogo[] = [
  'recentes',
  'preco_asc',
  'preco_desc',
] as const;

export interface ParametrosCatalogo {
  pais: Praca | null;
  ordenar: OrdenacaoCatalogo;
}

// O estado da URL quando o visitante não escolhe nada.
export const PARAMETROS_PADRAO: ParametrosCatalogo = { pais: null, ordenar: 'recentes' };

export interface ItemDaListagem {
  ref: string;
  slug: string;
  titulo: string;
  tipologia: ItemCatalogo['tipologia'];
  situacao: ItemCatalogo['situacao'];
  pais: Praca;
  cidade: string;
  bairro: string;
  preco: ItemCatalogo['preco'];
  capa: ItemCatalogo['capa'];
}

export interface ListagemPublica {
  itens: ItemDaListagem[];
  total: number;
}

// Parâmetro de consulta tem que ser texto. Array e objeto vêm de quem chuta o formato da API.
function somenteTexto(valor: unknown): string | null {
  if (valor === undefined) return '';
  if (typeof valor !== 'string') return null;
  return valor.trim();
}

// null significa "valor fora da lista": a API responde 400 e a página volta para o padrão.
export function interpretarParametros(
  consulta: Record<string, unknown>
): ParametrosCatalogo | null {
  const pais = somenteTexto(consulta['pais']);
  const ordenar = somenteTexto(consulta['ordenar']);
  if (pais === null || ordenar === null) return null;

  if (pais !== '' && !PRACAS_VALIDAS.includes(pais as Praca)) return null;

  const ordem = ordenar === '' ? 'recentes' : ordenar;
  if (!ORDENACOES_VALIDAS.includes(ordem as OrdenacaoCatalogo)) return null;

  return {
    pais: pais === '' ? null : (pais as Praca),
    ordenar: ordem as OrdenacaoCatalogo,
  };
}

export function listarImoveisDoSite(filtros: ParametrosCatalogo): ListagemPublica {
  const itens = listarParaCatalogo(filtros).map<ItemDaListagem>((imovel) => ({
    ref: imovel.ref,
    slug: imovel.slug,
    titulo: imovel.titulo,
    tipologia: imovel.tipologia,
    situacao: imovel.situacao,
    pais: imovel.pais,
    cidade: imovel.cidade,
    bairro: imovel.bairro,
    preco: imovel.preco,
    capa: imovel.capa,
  }));

  return { itens, total: itens.length };
}
