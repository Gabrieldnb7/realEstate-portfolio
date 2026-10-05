// API de textos do painel (Anexo D, seção 4): grava o texto de uma página e devolve o que ficou.
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { DominioInvalidoError } from '../../entities/index.js';
import { CampoObrigatorioAusenteError, PaginaNaoEditavelError, salvarTextoDaPagina } from './textos.servico.js';

function paginaDaRota(request: FastifyRequest): string {
  return (request.params as { pagina?: string }).pagina ?? '';
}

function responderFalha(reply: FastifyReply, erro: unknown, log: FastifyRequest['log']): FastifyReply {
  if (erro instanceof CampoObrigatorioAusenteError) {
    return reply.status(400).send({ erro: 'requisicao_invalida', campos: erro.campos });
  }

  if (erro instanceof PaginaNaoEditavelError) {
    return reply
      .status(422)
      .send({ erro: 'dados_invalidos', campos: [{ campo: 'pagina', codigo: 'invalida' }] });
  }

  if (erro instanceof DominioInvalidoError) {
    return reply.status(422).send({ erro: 'dados_invalidos', campos: erro.campos });
  }

  log.error({ err: erro }, 'falha inesperada ao gravar texto');
  return reply.status(500).send({ erro: 'falha_interna' });
}

export async function rotasTextosAdmin(app: FastifyInstance): Promise<void> {
  app.put('/api/v1/admin/textos/:pagina', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      return reply.status(200).send(salvarTextoDaPagina(paginaDaRota(request), request.body));
    } catch (erro) {
      return responderFalha(reply, erro, request.log);
    }
  });
}
