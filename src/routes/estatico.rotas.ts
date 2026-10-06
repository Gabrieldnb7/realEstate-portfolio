// Estilo do site: entrega arquivos fixos de public/css, com nome validado antes do caminho.
import { statSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

const PASTA_CSS = resolve('public', 'css');
const NOME_DE_ARQUIVO = /^[a-z0-9][a-z0-9-]*\.css$/;

export function lerArquivoCss(nome: string): { conteudo: string; tamanho: number } | null {
  // O regex já descarta caminho, ponto duplo e qualquer extensão que não seja .css.
  if (!NOME_DE_ARQUIVO.test(nome)) return null;

  const caminho = join(PASTA_CSS, nome);
  try {
    const estatisticas = statSync(caminho);
    if (!estatisticas.isFile()) return null;

    return { conteudo: readFileSync(caminho, 'utf8'), tamanho: estatisticas.size };
  } catch {
    return null;
  }
}

export async function rotasEstaticas(app: FastifyInstance): Promise<void> {
  app.get('/css/:arquivo', async (request: FastifyRequest, reply: FastifyReply) => {
    const nome = (request.params as { arquivo?: string }).arquivo ?? '';

    const arquivo = lerArquivoCss(nome);
    if (!arquivo) {
      return reply.status(404).type('text/plain').send('estilo_nao_encontrado');
    }

    return reply
      .header('content-type', 'text/css; charset=utf-8')
      .header('content-length', arquivo.tamanho)
      .header('x-content-type-options', 'nosniff')
      .header('cache-control', 'public, max-age=300')
      .send(arquivo.conteudo);
  });
}
