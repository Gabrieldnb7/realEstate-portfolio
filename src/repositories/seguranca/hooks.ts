import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ConfigApp } from '../../config/ambiente.js';
import { ERRO_NAO_AUTENTICADO, validarSessao } from '../../modules/auth/auth.servico.js';
import type { UsuarioSessao } from '../../modules/auth/auth.servico.js';

export const NOME_COOKIE_SESSAO = 'sessao_id';

const PREFIXOS_PROTEGIDOS = ['/admin', '/api/v1/admin'];
// Entradas próprias do fluxo de entrar; as demais rotas de /admin exigem sessão.
const CAMINHOS_LIVRES = ['/admin/login'];

export function rotaExigeSessao(url: string): boolean {
  const caminho = url.split('?')[0] ?? url;

  const livre = CAMINHOS_LIVRES.some((entrada) => caminho === entrada || caminho.startsWith(`${entrada}/`));
  if (livre) return false;

  return PREFIXOS_PROTEGIDOS.some((prefixo) => caminho === prefixo || caminho.startsWith(`${prefixo}/`));
}

export function gravarCookieSessao(
  reply: FastifyReply,
  token: string,
  expiraEm: Date,
  config: ConfigApp
): void {
  reply.setCookie(NOME_COOKIE_SESSAO, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: config.cookieSeguro,
    signed: true,
    maxAge: Math.max(0, Math.floor((expiraEm.getTime() - Date.now()) / 1000)),
  });
}

export function limparCookieSessao(reply: FastifyReply): void {
  reply.clearCookie(NOME_COOKIE_SESSAO, { path: '/' });
}

export function lerTokenSessao(request: FastifyRequest): string | null {
  const valorBruto = request.cookies[NOME_COOKIE_SESSAO];
  if (!valorBruto) return null;

  const assinado = request.unsignCookie(valorBruto);
  if (!assinado.valid) return null;

  return assinado.value ?? null;
}

function negarAcesso(request: FastifyRequest, reply: FastifyReply, tinhaCookie: boolean): FastifyReply {
  if (tinhaCookie) limparCookieSessao(reply);

  const caminhoDeApi = (request.url.split('?')[0] ?? request.url).startsWith('/api/');
  if (caminhoDeApi) {
    return reply.status(401).send({ erro: ERRO_NAO_AUTENTICADO });
  }
  return reply.redirect('/admin/login', 302);
}

export async function hookExigirSessao(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<FastifyReply | void> {
  if (!rotaExigeSessao(request.url)) return;

  const token = lerTokenSessao(request);
  const usuario = token ? validarSessao(token) : null;

  if (!usuario) {
    return negarAcesso(request, reply, token !== null);
  }

  request.usuarioLogado = usuario;
}

export function registrarProtecaoPainel(app: FastifyInstance): void {
  app.addHook('preHandler', hookExigirSessao);
}

declare module 'fastify' {
  interface FastifyRequest {
    usuarioLogado?: UsuarioSessao;
  }
}
