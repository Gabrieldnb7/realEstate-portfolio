// Tela de login e saída do painel, em formulário urlencoded, sem depender de JavaScript.
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { carregarConfig } from '../../config/ambiente.js';
import {
  gravarCookieSessao,
  lerTokenSessao,
  limparCookieSessao,
} from '../../repositories/seguranca/hooks.js';
import {
  CredenciaisInvalidasError,
  fazerLogin,
  fazerLogout,
  validarSessao,
} from './auth.servico.js';

const MAXIMO_TENTATIVAS_POR_JANELA = 10;
const JANELA_TENTATIVAS_MS = 60_000;
const MENSAGEM_DE_FALHA = 'E-mail ou senha não conferem.';

function campoDoCorpo(request: FastifyRequest, campo: string): string {
  const bruto = request.body;
  if (typeof bruto !== 'object' || bruto === null) return '';
  const valor = (bruto as Record<string, unknown>)[campo];
  return typeof valor === 'string' ? valor : '';
}

export async function rotasPaginaLogin(app: FastifyInstance): Promise<void> {
  const config = carregarConfig();

  app.get('/admin/login', async (request: FastifyRequest, reply: FastifyReply) => {
    const token = lerTokenSessao(request);
    if (token && validarSessao(token)) {
      return reply.redirect('/admin', 302);
    }

    return reply.view('admin/login.eta', { erro: null });
  });

  app.post(
    '/admin/login',
    {
      config: {
        rateLimit: { max: MAXIMO_TENTATIVAS_POR_JANELA, timeWindow: JANELA_TENTATIVAS_MS },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { token, usuario, expiraEm } = await fazerLogin(
          campoDoCorpo(request, 'email'),
          campoDoCorpo(request, 'senha'),
          config
        );
        gravarCookieSessao(reply, token, expiraEm, config);
        return reply.redirect('/admin', 302);
      } catch (erro) {
        if (erro instanceof CredenciaisInvalidasError) {
          // Mesma mensagem para e-mail não cadastrado e para senha errada.
          return reply.status(401).view('admin/login.eta', { erro: MENSAGEM_DE_FALHA });
        }

        request.log.error({ err: erro }, 'falha inesperada no login do painel');
        return reply.status(500).type('text/plain').send('falha_interna');
      }
    }
  );

  app.post('/admin/logout', async (request: FastifyRequest, reply: FastifyReply) => {
    const token = lerTokenSessao(request);
    if (token) fazerLogout(token);

    limparCookieSessao(reply);
    return reply.redirect('/admin/login', 302);
  });
}
