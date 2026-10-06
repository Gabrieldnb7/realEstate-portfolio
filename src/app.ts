import fastifyCookie from '@fastify/cookie';
import fastifyCors from '@fastify/cors';
import fastifyMultipart from '@fastify/multipart';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyView from '@fastify/view';
import { Eta } from 'eta';
import Fastify, { type FastifyError } from 'fastify';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { carregarConfig } from './config/ambiente.js';
import { LIMITE_BYTES_POR_IMAGEM } from './infra/armazenamento/upload.js';
import { rotasFotosImovel } from './modules/admin/fotos.rotas.js';
import { rotasImoveisAdmin } from './modules/admin/imoveis.rotas.js';
import { rotasPainel } from './modules/admin/painel.rotas.js';
import { rotasTextosAdmin } from './modules/admin/textos.rotas.js';
import { rotasAutenticacao } from './modules/auth/auth.rotas.js';
import { rotasPaginaLogin } from './modules/auth/login.rotas.js';
import { registrarProtecaoPainel } from './repositories/seguranca/hooks.js';
import { rotasCatalogo } from './routes/catalogo.rotas.js';
import { rotasDetalhe } from './routes/detalhe.rotas.js';
import { rotasEstaticas } from './routes/estatico.rotas.js';
import { rotasMidia } from './routes/media.js';
import { baseDaPaginaPublica, rotasSite } from './routes/site.js';
import { saudeRoutes } from './routes/saude.js';

export async function buildApp() {
  const config = carregarConfig();
  const app = Fastify({ logger: config.ambiente !== 'test' });

  const pastaViews = path.join(fileURLToPath(import.meta.url), '..', 'views');
  const eta = new Eta({ views: pastaViews });

  // Os formulários do painel enviam urlencoded; o Fastify só traz parser para JSON e texto.
  app.addContentTypeParser(
    'application/x-www-form-urlencoded',
    { parseAs: 'string' },
    (_request, corpo: string, done) => {
      done(null, Object.fromEntries(new URLSearchParams(corpo)));
    }
  );

  app.register(fastifyView, {
    engine: { eta: eta },
    root: pastaViews,
  });

  // Limite de 5 MB por foto aplicado pelo parser, antes de qualquer gravação em disco.
  app.register(fastifyMultipart, {
    limits: {
      fileSize: LIMITE_BYTES_POR_IMAGEM,
      files: 1,
      fields: 8,
      fieldSize: 8 * 1024,
      headerPairs: 64,
    },
  });

  app.register(fastifyCors, {
    origin: '*',
  });

  // Assinatura do cookie de sessão com SEGREDO_APP (validade conferida no servidor).
  app.register(fastifyCookie, { secret: config.segredoApp });

  app.register(fastifyRateLimit, {
    global: false,
    errorResponseBuilder: () => ({ statusCode: 429, erro: 'muitas_requisicoes' }),
  });

  // O filtro roda antes de qualquer rota do painel; as rotas abaixo já nascem protegidas.
  registrarProtecaoPainel(app);

  // Erros do próprio Fastify (corpo malformado, media type, 404 de rota) saem no formato do contrato.
  app.setErrorHandler((erro: FastifyError, request, reply) => {
    const status = erro.statusCode && erro.statusCode >= 400 ? erro.statusCode : 500;
    const codigo = status >= 500 ? 'falha_interna' : 'requisicao_invalida';

    if (status >= 500) request.log.error({ err: erro }, 'erro não mapeado');

    if ((request.url.split('?')[0] ?? request.url).startsWith('/api/')) {
      return reply.status(status).send({ erro: codigo });
    }
    return reply.status(status).type('text/plain').send(codigo);
  });

  app.register(saudeRoutes);
  app.register(rotasEstaticas);
  app.register(rotasSite);
  app.register(rotasCatalogo);
  app.register(rotasDetalhe);
  app.register(rotasMidia);
  app.register(rotasAutenticacao);
  app.register(rotasPaginaLogin);
  app.register(rotasImoveisAdmin);
  app.register(rotasTextosAdmin);
  app.register(rotasFotosImovel);
  app.register(rotasPainel);

  // 404 amigável: JSON no contrato para a API, página para quem navega. O handler precisa nascer
  // na raiz porque o handler de um plugin só cobre as rotas daquele plugin.
  app.setNotFoundHandler((request, reply) => {
    const caminho = request.url.split('?')[0] ?? request.url;
    if (caminho.startsWith('/api/')) {
      return reply.status(404).send({ erro: 'rota_nao_encontrada' });
    }

    return reply.status(404).view(
      'site/nao-encontrado.eta',
      baseDaPaginaPublica('Não encontrado'),
      { layout: 'site/layout.eta' }
    );
  });

  return app;
}
