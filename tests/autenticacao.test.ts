import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { FastifyInstance } from 'fastify';

const bancoTemporario = join(tmpdir(), `teste-autenticacao-${randomUUID()}.sqlite`);

process.env.DB_PATH = bancoTemporario;
process.env.NODE_ENV = 'test';
process.env.COOKIE_SECURE = 'false';
process.env.SESSAO_TTL_SEGUNDOS = '3600';
process.env.SEGREDO_APP = 'segredo-de-teste-com-mais-de-trinta-bits-ok';

const { buildApp } = await import('../src/app.js');
const { conectarBanco, fecharBanco } = await import('../src/infra/db.js');
const { executarMigracoes } = await import('../scripts/migrar.js');
const { criarHashSenha } = await import('../src/repositories/seguranca/senhas.js');
const { chaveDaSessao } = await import('../src/modules/auth/auth.servico.js');
const { NOME_COOKIE_SESSAO } = await import('../src/repositories/seguranca/hooks.js');

const EMAIL_ADMIN = 'admin@exemplo.com';
const SENHA_ADMIN = 'senhaSegura123';

type Resposta = Awaited<ReturnType<FastifyInstance['inject']>>;

function cookieCompleto(resposta: Resposta): string {
  const bruto = resposta.headers['set-cookie'];
  const itens = (Array.isArray(bruto) ? bruto : bruto ? [bruto] : []).map(String);
  const encontrado = itens.find((item) => item.startsWith(`${NOME_COOKIE_SESSAO}=`));
  if (!encontrado) throw new Error(`nenhum cookie ${NOME_COOKIE_SESSAO} na resposta: ${itens.join(' | ')}`);
  return encontrado;
}

function parDoCookie(resposta: Resposta): string {
  return cookieCompleto(resposta).split(';')[0]!;
}

async function appComRotasDoPainel(): Promise<FastifyInstance> {
  const app = await buildApp();

  // Rotas fictícias do painel: servem só para exercitar o filtro de sessão.
  app.register(async (instancia) => {
    instancia.get('/api/v1/admin/exemplo', async (request) => ({
      nome: request.usuarioLogado?.nome ?? null,
    }));
    instancia.get('/admin/painel', async () => ({ ok: true }));
  });

  await app.ready();
  return app;
}

async function fazerLogin(app: FastifyInstance, email = EMAIL_ADMIN, senha = SENHA_ADMIN) {
  return app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, senha } });
}

describe('Autenticação e sessão HttpOnly', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    executarMigracoes();

    conectarBanco()
      .prepare('INSERT INTO usuarios (id, nome, email, senha_hash, criado_em) VALUES (?, ?, ?, ?, ?)')
      .run(
        randomUUID(),
        'Administrador',
        EMAIL_ADMIN,
        await criarHashSenha(SENHA_ADMIN),
        new Date().toISOString()
      );
  });

  // Cada teste ganha um app novo: o limitador de tentativas é por instância.
  beforeEach(async () => {
    conectarBanco().prepare('DELETE FROM sessoes').run();
    app = await appComRotasDoPainel();
  });

  afterEach(async () => {
    await app.close();
  });

  afterAll(() => {
    fecharBanco();
    for (const sufixo of ['', '-wal', '-shm']) {
      rmSync(`${bancoTemporario}${sufixo}`, { force: true });
    }
  });

  it('emite cookie de sessão HttpOnly e grava a sessão com expiração', async () => {
    const resposta = await fazerLogin(app);

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({
      usuario: { id: expect.any(String), nome: 'Administrador' },
    });

    const cookie = cookieCompleto(resposta);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');

    // O cookie expira junto com a sessão (TTL de 3600 s do ambiente de teste).
    const maxAge = Number(/Max-Age=(\d+)/.exec(cookie)?.[1]);
    expect(maxAge).toBeGreaterThan(3500);
    expect(maxAge).toBeLessThanOrEqual(3600);
    expect(cookie.toLowerCase()).not.toContain('samesite=none');

    const db = conectarBanco();
    const sessoes = db.prepare('SELECT id, expira_em FROM sessoes').all() as { id: string; expira_em: string }[];
    expect(sessoes).toHaveLength(1);

    // O banco guarda apenas o resumo do token: uma cópia do arquivo não entrega sessão válida.
    const token = parDoCookie(resposta).split('=')[1]!.split('.')[0]!;
    expect(sessoes[0]!.id).not.toBe(token);
    expect(sessoes[0]!.id).toMatch(/^[0-9a-f]{64}$/);
    expect(new Date(sessoes[0]!.expira_em).getTime()).toBeGreaterThan(Date.now());
  });

  it('grava a senha como hash argon2id, nunca em texto plano', async () => {
    const linha = conectarBanco()
      .prepare('SELECT senha_hash FROM usuarios WHERE email = ?')
      .get(EMAIL_ADMIN) as { senha_hash: string };

    expect(linha.senha_hash.startsWith('$argon2id$')).toBe(true);
    expect(linha.senha_hash).not.toContain(SENHA_ADMIN);
  });

  it('responde igual para senha errada e para e-mail não cadastrado', async () => {
    const senhaErrada = await fazerLogin(app, EMAIL_ADMIN, 'senhaErrada123');
    const emailInexistente = await fazerLogin(app, 'ninguem@exemplo.com', SENHA_ADMIN);

    expect(senhaErrada.statusCode).toBe(401);
    expect(emailInexistente.statusCode).toBe(401);
    expect(emailInexistente.json()).toEqual({ erro: 'credenciais_invalidas' });
    expect(emailInexistente.body).toBe(senhaErrada.body);
  });

  it('recusa corpo incompleto no login com 400', async () => {
    const respostas = await Promise.all([
      app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: {} }),
      app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: EMAIL_ADMIN } }),
      app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: '', senha: '' } }),
    ]);

    for (const resposta of respostas) {
      expect(resposta.statusCode).toBe(400);
      expect(resposta.json()).toEqual({ erro: 'credenciais_invalidas' });
    }
  });

  it('invalida a sessão no banco e no cookie ao sair', async () => {
    const login = await fazerLogin(app);
    const cookie = parDoCookie(login);

    const protegida = await app.inject({ method: 'GET', url: '/api/v1/admin/exemplo', headers: { cookie } });
    expect(protegida.statusCode).toBe(200);
    expect(protegida.json()).toEqual({ nome: 'Administrador' });

    const logout = await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: { cookie } });
    expect(logout.statusCode).toBe(204);
    expect(logout.body).toBe('');
    expect(cookieCompleto(logout)).toContain('Max-Age=0');

    const quantidade = conectarBanco()
      .prepare('SELECT COUNT(*) AS total FROM sessoes')
      .get() as { total: number };
    expect(quantidade.total).toBe(0);

    const depoisDeSair = await app.inject({ method: 'GET', url: '/api/v1/admin/exemplo', headers: { cookie } });
    expect(depoisDeSair.statusCode).toBe(401);
    expect(depoisDeSair.json()).toEqual({ erro: 'nao_autenticado' });
  });

  it('exige sessão válida para fazer logout', async () => {
    const semCookie = await app.inject({ method: 'POST', url: '/api/v1/auth/logout' });
    expect(semCookie.statusCode).toBe(401);

    const login = await fazerLogin(app);
    const tokenOutro = parDoCookie(login).replace(/=[^;]+/, '=token-forjado');
    const cookieForjado = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: { cookie: tokenOutro },
    });
    expect(cookieForjado.statusCode).toBe(401);
  });

  it('protege o painel: 401 para a API e 302 para as páginas', async () => {
    const api = await app.inject({ method: 'GET', url: '/api/v1/admin/exemplo' });
    expect(api.statusCode).toBe(401);
    expect(api.json()).toEqual({ erro: 'nao_autenticado' });

    const pagina = await app.inject({
      method: 'GET',
      url: '/admin/painel',
      headers: { accept: 'text/html' },
    });
    expect(pagina.statusCode).toBe(302);
    expect(pagina.headers.location).toBe('/admin/login');

    const cookieAdulterado = await app.inject({
      method: 'GET',
      url: '/admin/painel',
      headers: { cookie: `${NOME_COOKIE_SESSAO}=abc.def` },
    });
    expect(cookieAdulterado.statusCode).toBe(302);
  });

  it('não deixa uma sessão expirada reabrir o painel', async () => {
    const login = await fazerLogin(app);
    const cookie = parDoCookie(login);
    const token = cookie.split('=')[1]!.split('.')[0]!;

    const db = conectarBanco();
    db.prepare('UPDATE sessoes SET expira_em = ? WHERE id = ?').run(
      new Date(Date.now() - 60_000).toISOString(),
      chaveDaSessao(token)
    );

    const resposta = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/exemplo',
      headers: { cookie },
    });
    expect(resposta.statusCode).toBe(401);

    const restante = db.prepare('SELECT COUNT(*) AS total FROM sessoes WHERE id = ?').get(
      chaveDaSessao(token)
    ) as { total: number };
    expect(restante.total).toBe(0);
  });

  it('limita tentativas repetidas de adivinhar a senha', async () => {
    const codigos: number[] = [];

    for (let tentativa = 0; tentativa < 12; tentativa++) {
      const resposta = await fazerLogin(app, EMAIL_ADMIN, `errada-${tentativa}`);
      codigos.push(resposta.statusCode);
    }

    expect(codigos.filter((codigo) => codigo === 401)).toHaveLength(10);
    expect(codigos.slice(10)).toEqual([429, 429]);
    expect((await fazerLogin(app)).statusCode).toBe(429);
  });
});
