// Rotas de foto da API (Anexo D): upload em multipart, remoção e leitura pública do arquivo.
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { DominioInvalidoError } from '../../entities/index.js';
import { FormatodeImagemInvalidoError } from '../../infra/armazenamento/upload.js';
import { ImovelNaoEncontradoError } from './imoveis.servico.js';
import { ArquivoGrandeDemaisError, lerUploadDeImagem } from './fotos.entrada.js';
import { ImagemNaoEncontradaError, adicionarFoto, removerFoto } from './fotos.servico.js';

function idDaRota(request: FastifyRequest): string {
  return (request.params as { id?: string }).id ?? '';
}

function responderFalha(reply: FastifyReply, erro: unknown, log: FastifyRequest['log']): FastifyReply {
  if (erro instanceof ImovelNaoEncontradoError) {
    return reply.status(404).send({ erro: 'imovel_nao_encontrado' });
  }
  if (erro instanceof ImagemNaoEncontradaError) {
    return reply.status(404).send({ erro: 'imagem_nao_encontrada' });
  }
  if (erro instanceof ArquivoGrandeDemaisError) {
    return reply.status(413).send({ erro: 'arquivo_grande_demais' });
  }
  if (erro instanceof FormatodeImagemInvalidoError) {
    return reply.status(415).send({ erro: 'formato_nao_aceito' });
  }
  if (erro instanceof DominioInvalidoError) {
    return reply.status(422).send({ erro: 'dados_invalidos', campos: erro.campos });
  }

  log.error({ err: erro }, 'falha inesperada ao lidar com fotos');
  return reply.status(500).send({ erro: 'falha_interna' });
}

export async function rotasFotosImovel(app: FastifyInstance): Promise<void> {
  app.post(
    '/api/v1/admin/imoveis/:id/imagens',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const imovelId = idDaRota(request);

      try {
        const entrada = await lerUploadDeImagem(request);

        if (!entrada.arquivo) {
          return reply.status(400).send({
            erro: 'requisicao_invalida',
            campos: [{ campo: 'arquivo', codigo: 'obrigatorio' }],
          });
        }

        const criada = adicionarFoto(imovelId, {
          conteudo: entrada.arquivo.conteudo,
          nomeOriginal: entrada.arquivo.nomeOriginal,
          alt: entrada.alt,
        });

        return reply.status(201).send(criada);
      } catch (erro) {
        return responderFalha(reply, erro, request.log);
      }
    }
  );

  app.delete(
    '/api/v1/admin/imoveis/:id/imagens/:imagemId',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const params = request.params as { id?: string; imagemId?: string };

      try {
        removerFoto(params.id ?? '', params.imagemId ?? '');
        return reply.status(204).send();
      } catch (erro) {
        return responderFalha(reply, erro, request.log);
      }
    }
  );
}
