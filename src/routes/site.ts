// Início pública (Anexo E, mapa de páginas). O texto editável é lido do banco a cada requisição,
// então o que o painel salva aparece no site sem mexer no código.
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { textoDaPagina } from '../modules/admin/textos.servico.js';
import { listarImoveisDoSite, PARAMETROS_PADRAO } from '../services/catalogo.servico.js';
import { cartoesDoSite } from '../utils/cartoes.site.js';

// Anexo B: o aviso vai em todas as páginas públicas. Ele sai do código porque o texto editável
// do rodapé não pode, em nenhuma gravação, deixar a página sem o aviso.
export const AVISO_DE_PROJETO = 'Projeto de avaliação técnica. Imóveis, valores e contatos fictícios.';

const PRACAS = [
  {
    nome: 'Brasil',
    cidades: 'São Paulo, Rio de Janeiro, Porto Feliz',
    chamada: 'Imóveis no Brasil',
    url: '/imoveis?pais=BR',
  },
  {
    nome: 'Panamá',
    cidades: 'Cidade do Panamá, Coronado, Cerro Azul',
    chamada: 'Imóveis no Panamá',
    url: '/imoveis?pais=PA',
  },
  {
    nome: 'Emirados Árabes Unidos',
    cidades: 'Dubai',
    chamada: 'Imóveis nos Emirados Árabes Unidos',
    url: '/imoveis?pais=AE',
  },
];

const TOTAL_DE_DESTAQUES = 3;

export function textoDoRodape(): ReturnType<typeof textoDaPagina>['campos'] {
  return textoDaPagina('rodape').campos;
}

export async function rotasSite(app: FastifyInstance): Promise<void> {
  app.get('/', async (_request: FastifyRequest, reply: FastifyReply) => {
    const destaques = listarImoveisDoSite(PARAMETROS_PADRAO).itens.slice(0, TOTAL_DE_DESTAQUES);

    return reply.view(
      'site/inicio.eta',
      {
        tituloPagina: 'Início',
        texto: textoDaPagina('inicio').campos,
        rodape: textoDoRodape(),
        aviso: AVISO_DE_PROJETO,
        pracas: PRACAS,
        cartoes: cartoesDoSite(destaques),
      },
      { layout: 'site/layout.eta' }
    );
  });
}
