import fastifyCookie from '@fastify/cookie';
import fastifyCors from '@fastify/cors';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyView from '@fastify/view';
import { Eta } from 'eta';
import Fastify from 'fastify';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { carregarConfig } from './config/ambiente.js';
import { rotasAutenticacao } from './modules/auth/auth.rotas.js';
import { registrarProtecaoPainel } from './repositories/seguranca/hooks.js';
import { saudeRoutes } from './routes/saude.js';

export async function buildApp() {
  const config = carregarConfig();
  const app = Fastify({ logger: config.ambiente !== 'test' });

  const pastaViews = path.join(fileURLToPath(import.meta.url), '..', 'views');
  const eta = new Eta({ views: pastaViews });

  app.register(fastifyView, {
    engine: { eta: eta },
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

  app.register(saudeRoutes);
  app.register(rotasAutenticacao);

  return app;
}
