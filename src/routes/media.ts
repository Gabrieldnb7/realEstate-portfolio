// Entrega das fotos: rota pública, sem sessão, que só conhece arquivos já gravados por nós.
import { createReadStream } from 'node:fs';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { abrirMidia } from '../infra/armazenamento/upload.js';

export async function rotasMidia(app: FastifyInstance): Promise<void> {
  app.get('/media/:arquivo', async (request: FastifyRequest, reply: FastifyReply) => {
    const nome = (request.params as { arquivo?: string }).arquivo ?? '';

    const midia = abrirMidia(nome);
    if (!midia) {
      return reply.status(404).type('text/plain').send('midia_nao_encontrada');
    }

    return reply
      .header('content-type', midia.contentType)
      .header('content-length', midia.tamanho)
      .header('x-content-type-options', 'nosniff')
      .header('cache-control', 'public, max-age=86400')
      .send(createReadStream(midia.caminho));
  });
}
