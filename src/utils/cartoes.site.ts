// Modelo de visão dos cartões: a mesma composição para a Início (destaques) e para o catálogo.
import type { SituacaoImovel } from '../entities/index.js';
import type { ItemDaListagem } from '../services/catalogo.servico.js';
import { precoParaTela } from './formatar.valores.js';

// Publicado é a situação normal da lista e não merece selo.
const SELO_POR_SITUACAO: Partial<Record<SituacaoImovel, string>> = {
  reservado: 'Reservado',
  vendido: 'Vendido',
};

export function cartoesDoSite(itens: ItemDaListagem[]) {
  return itens.map((imovel) => ({
    url: `/imoveis/${imovel.slug}`,
    titulo: imovel.titulo,
    local: `${imovel.cidade}, ${imovel.bairro}`,
    preco: precoParaTela(imovel.preco),
    selo: SELO_POR_SITUACAO[imovel.situacao] ?? null,
    capa: imovel.capa,
  }));
}
