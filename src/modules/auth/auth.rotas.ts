import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { carregarConfig } from '../../config/ambiente.js';
import {
  gravarCookieSessao,
  lerTokenSessao,
  limparCookieSessao,
} from '../../repositories/seguranca/hooks.js';
import {
  CredenciaisInvalidasError,
  ERRO_CREDENCIAIS_INVALIDAS,
  ERRO_NAO_AUTENTICADO,
  fazerLogin,
  fazerLogout,
  validarSessao,
} from './auth.servico.js';

// Objetivo 6 da seção 3.3: o login não pode ser usado para tentar senhas sem limite.
const MAXIMO_TENTATIVAS_POR_JANELA = 10;
const JANELA_TENTATIVAS_MS = 60_000;

interface CorpoLogin {
  email?: unknown;
  senha?: unknown;
}

function corpoDeLoginValido(body: unknown): body is { email: string; senha: string } {
  if (typeof body !== 'object' || body === null) return false;
  const corpo = body as CorpoLogin;
  return (
    typeof corpo.email === 'string' &&
    corpo.email.trim().length > 0 &&
    typeof corpo.senha === 'string' &&
    corpo.senha.length > 0
  );
}

export async function rotasAutenticacao(app: FastifyInstance): Promise<void> {
  const config = carregarConfig();

  app.post(
    '/api/v1/auth/login',
    {
      config: {
        rateLimit: {
          max: MAXIMO_TENTATIVAS_POR_JANELA,
          timeWindow: JANELA_TENTATIVAS_MS,
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!corpoDeLoginValido(request.body)) {
        return reply.status(400).send({ erro: ERRO_CREDENCIAIS_INVALIDAS });
      }

      try {
        const { token, usuario, expiraEm } = await fazerLogin(
          request.body.email,
          request.body.senha,
          config
        );
        gravarCookieSessao(reply, token, expiraEm, config);
        return reply.status(200).send({ usuario });
      } catch (erro) {
        if (erro instanceof CredenciaisInvalidasError) {
          // Mesma resposta para e-mail não cadastrado e senha errada (objetivo 8).
          return reply.status(401).send({ erro: ERRO_CREDENCIAIS_INVALIDAS });
        }
        request.log.error(erro, 'falha inesperada no login');
        return reply.status(500).send({ erro: 'falha_interna' });
      }
    }
  );

  app.post('/api/v1/auth/logout', async (request: FastifyRequest, reply: FastifyReply) => {
    const token = lerTokenSessao(request);

    if (!token || !validarSessao(token)) {
      if (token) limparCookieSessao(reply);
      return reply.status(401).send({ erro: ERRO_NAO_AUTENTICADO });
    }

    fazerLogout(token);
    limparCookieSessao(reply);
    return reply.status(204).send();
  });
}
