// API JSON do painel (Anexo D, seção 4). Toda rota abaixo está atrás do filtro de sessão
// porque nasce sob /api/v1/admin.
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { DominioInvalidoError } from '../../entities/index.js';
import {
  ImovelNaoEncontradoError,
  MARCA_REQUISICAO_INVALIDA,
  atualizarImovelNoCatalogo,
  criarImovelNoCatalogo,
  mudarSituacaoDoImovel,
} from './imoveis.servico.js';

function idDaRota(request: FastifyRequest): string {
  return (request.params as { id?: string }).id ?? '';
}

function responderFalha(reply: FastifyReply, erro: unknown, log: FastifyRequest['log']): FastifyReply {
  if (erro instanceof ImovelNaoEncontradoError) {
    return reply.status(404).send({ erro: 'imovel_nao_encontrado' });
  }

  if (erro instanceof DominioInvalidoError) {
    // Corpo que nem é objeto é 400; regra do catálogo descumprida é 422 com os campos.
    const requisicaoMalformada = erro.message === MARCA_REQUISICAO_INVALIDA;
    return reply
      .status(requisicaoMalformada ? 400 : 422)
      .send({
        erro: requisicaoMalformada ? 'requisicao_invalida' : 'dados_invalidos',
        campos: erro.campos,
      });
  }

  log.error({ err: erro }, 'falha inesperada ao gravar imóvel');
  return reply.status(500).send({ erro: 'falha_interna' });
}

export async function rotasImoveisAdmin(app: FastifyInstance): Promise<void> {
  app.post('/api/v1/admin/imoveis', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const criado = criarImovelNoCatalogo(request.body);
      return reply.status(201).send(criado);
    } catch (erro) {
      return responderFalha(reply, erro, request.log);
    }
  });

  app.patch('/api/v1/admin/imoveis/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const atualizado = atualizarImovelNoCatalogo(idDaRota(request), request.body);
      return reply.status(200).send(atualizado);
    } catch (erro) {
      return responderFalha(reply, erro, request.log);
    }
  });

  app.post(
    '/api/v1/admin/imoveis/:id/situacao',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const mudanca = mudarSituacaoDoImovel(idDaRota(request), request.body);
        return reply.status(200).send(mudanca);
      } catch (erro) {
        return responderFalha(reply, erro, request.log);
      }
    }
  );
}
