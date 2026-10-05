// Início pública (Anexo E, mapa de páginas). O texto editável é lido do banco a cada requisição,
// então o que o painel salva aparece no site sem mexer no código.
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { textoDaPagina } from '../modules/admin/textos.servico.js';

// Anexo B: o aviso vai em todas as páginas públicas. Ele sai do código porque o texto editável
// do rodapé não pode, em nenhuma gravação, deixar a página sem o aviso.
export const AVISO_DE_PROJETO = 'Projeto de avaliação técnica. Imóveis, valores e contatos fictícios.';

const PRACAS = [
  { nome: 'Brasil', cidades: 'São Paulo, Rio de Janeiro, Porto Feliz' },
  { nome: 'Panamá', cidades: 'Cidade do Panamá, Coronado, Cerro Azul' },
  { nome: 'Emirados Árabes Unidos', cidades: 'Dubai' },
];

export async function rotasSite(app: FastifyInstance): Promise<void> {
  app.get('/', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.view(
      'site/inicio.eta',
      {
        tituloPagina: 'Início',
        texto: textoDaPagina('inicio').campos,
        rodape: textoDaPagina('rodape').campos,
        aviso: AVISO_DE_PROJETO,
        pracas: PRACAS,
      },
      { layout: 'site/layout.eta' }
    );
  });
}
