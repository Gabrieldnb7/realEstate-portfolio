import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { FastifyInstance } from 'fastify';

const bancoTemporario = join(tmpdir(), `teste-textos-${randomUUID()}.sqlite`);

process.env.DB_PATH = bancoTemporario;
process.env.NODE_ENV = 'test';
process.env.COOKIE_SECURE = 'false';
process.env.SESSAO_TTL_SEGUNDOS = '3600';
process.env.SEGREDO_APP = 'segredo-de-teste-com-mais-de-trinta-bits-ok';

const { buildApp } = await import('../src/app.js');
const { conectarBanco, fecharBanco } = await import('../src/infra/db.js');
const { executarMigracoes } = await import('../scripts/migrar.js');
const { criarHashSenha } = await import('../src/repositories/seguranca/senhas.js');
const { buscarTexto } = await import('../src/repositories/textos/texto.repositorio.js');

const EMAIL_ADMIN = 'admin@exemplo.com';
const SENHA_ADMIN = 'senhaSegura123';

// Anexo B: o aviso é obrigatório em toda página pública, editável ou não.
const AVISO = 'Projeto de avaliação técnica. Imóveis, valores e contatos fictícios.';

const SEED_INICIO = { titulo: 'Título padrão', descricao: 'Frase padrão de apoio.' };
const SEED_RODAPE = { texto: 'Texto padrão do rodapé.', aviso: AVISO };

describe('Edição dos textos institucionais', () => {
  let app: FastifyInstance;
  let cookie = '';

  function linhaDaChave(chave: string): { conteudo_json: string; atualizado_em: string } | undefined {
    return conectarBanco()
      .prepare('SELECT conteudo_json, atualizado_em FROM textos_site WHERE chave = ?')
      .get(chave) as { conteudo_json: string; atualizado_em: string } | undefined;
  }

  function camposSalvos(chave: 'inicio' | 'rodape'): Record<string, string> {
    const registro = buscarTexto(chave);
    if (!registro) throw new Error(`texto ${chave} não foi gravado`);
    return registro.campos;
  }

  function gravarNaBase(chave: string, campos: Record<string, string>): void {
    conectarBanco()
      .prepare('INSERT OR REPLACE INTO textos_site (chave, conteudo_json, atualizado_em) VALUES (?, ?, ?)')
      .run(chave, JSON.stringify(campos), new Date().toISOString());
  }

  function colocarTexto(pagina: string, campos: Record<string, unknown>, cookieSessao = cookie) {
    return app.inject({
      method: 'PUT',
      url: `/api/v1/admin/textos/${pagina}`,
      payload: { campos },
      headers: { cookie: cookieSessao },
    });
  }

  function enviarFormularioDeTexto(pagina: string, campos: Record<string, string>, cookieSessao = cookie) {
    return app.inject({
      method: 'POST',
      url: `/admin/textos/${pagina}`,
      headers: { cookie: cookieSessao, 'content-type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams(campos).toString(),
    });
  }

  function codigosDeCampo(resposta: { json: () => unknown }): string[] {
    const corpo = resposta.json() as { campos?: { campo: string; codigo: string }[] };
    return (corpo.campos ?? []).map((erro) => `${erro.campo}:${erro.codigo}`);
  }

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

    app = await buildApp();
    await app.ready();

    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: EMAIL_ADMIN, senha: SENHA_ADMIN },
    });
    cookie = String(login.headers['set-cookie']).split(';')[0]!;
  });

  beforeEach(() => {
    conectarBanco().prepare('DELETE FROM textos_site').run();
    gravarNaBase('inicio', SEED_INICIO);
    gravarNaBase('rodape', SEED_RODAPE);
  });

  afterAll(async () => {
    await app.close();
    fecharBanco();
    rmSync(bancoTemporario, { force: true });
  });

  describe('API PUT /api/v1/admin/textos/:pagina', () => {
    it('grava o título da Início e substitui o conteúdo anterior', async () => {
      const resposta = await colocarTexto('inicio', { titulo: 'Patrimônio se constrói sob tese.' });

      expect(resposta.statusCode).toBe(200);
      expect(resposta.json()).toMatchObject({
        pagina: 'inicio',
        campos: { titulo: 'Patrimônio se constrói sob tese.' },
      });

      const linha = linhaDaChave('inicio');
      expect(linha?.conteudo_json).toBe(JSON.stringify({ titulo: 'Patrimônio se constrói sob tese.' }));
      // Substituir é substituir: a frase de apoio antiga não fica na linha.
      expect(camposSalvos('inicio').descricao).toBeUndefined();
    });

    it('grava o texto do rodapé preservando os campos livres enviados', async () => {
      const resposta = await colocarTexto('rodape', {
        texto: 'Imóveis com tese, nas praças que fazem sentido.',
      });

      expect(resposta.statusCode).toBe(200);
      expect(camposSalvos('rodape').texto).toBe('Imóveis com tese, nas praças que fazem sentido.');
    });

    it('aceita os campos livres da Início além do campo mínimo', async () => {
      const resposta = await colocarTexto('inicio', {
        titulo: 'Título novo',
        descricao: 'Frase nova.',
        chamada: 'Fale com a equipe.',
      });

      expect(resposta.statusCode).toBe(200);
      expect(camposSalvos('inicio')).toEqual({
        titulo: 'Título novo',
        descricao: 'Frase nova.',
        chamada: 'Fale com a equipe.',
      });
    });

    it('devolve 400 quando o campo obrigatório não vem', async () => {
      const vazio = await colocarTexto('inicio', {});
      expect(vazio.statusCode).toBe(400);
      expect(vazio.json()).toMatchObject({ erro: 'requisicao_invalida' });
      expect(codigosDeCampo(vazio)).toEqual(['titulo:obrigatorio']);

      const emBranco = await colocarTexto('inicio', { titulo: '   ' });
      expect(emBranco.statusCode).toBe(400);
      expect(codigosDeCampo(emBranco)).toEqual(['titulo:obrigatorio']);

      const semCampos = await colocarTexto('rodape', { texto: 'ok' });
      expect(semCampos.statusCode).toBe(200);

      const campoErrado = await colocarTexto('rodape', { titulo: 'não é o campo do rodapé' });
      expect(campoErrado.statusCode).toBe(400);
      expect(codigosDeCampo(campoErrado)).toEqual(['texto:obrigatorio']);
    });

    it('devolve 400 quando o corpo não traz a chave campos', async () => {
      const semChave = await app.inject({
        method: 'PUT',
        url: '/api/v1/admin/textos/inicio',
        payload: { titulo: 'solto' },
        headers: { cookie },
      });
      expect(semChave.statusCode).toBe(400);
      expect(codigosDeCampo(semChave)).toEqual(['campos:obrigatorio']);

      const corpoEscalar = await app.inject({
        method: 'PUT',
        url: '/api/v1/admin/textos/inicio',
        headers: { cookie, 'content-type': 'application/json' },
        payload: '"só uma string"',
      });
      expect(corpoEscalar.statusCode).toBe(400);
      expect(codigosDeCampo(corpoEscalar)).toEqual(['corpo:invalido']);
    });

    it('devolve 422 para valor presente e inválido', async () => {
      const numero = await colocarTexto('inicio', { titulo: 42 });
      expect(numero.statusCode).toBe(422);
      expect(numero.json()).toMatchObject({ erro: 'dados_invalidos' });
      expect(codigosDeCampo(numero)).toEqual(['titulo:texto_invalido']);

      const longo = await colocarTexto('inicio', { titulo: 'x'.repeat(501) });
      expect(longo.statusCode).toBe(422);
      expect(codigosDeCampo(longo)).toEqual(['titulo:maximo_excedido']);
      // Nada é gravado antes de a validação passar.
      expect(camposSalvos('inicio').titulo).toBe(SEED_INICIO.titulo);
    });

    it('recusa página que não tem texto editável', async () => {
      const resposta = await colocarTexto('imoveis', { titulo: 'Qualquer coisa' });

      expect(resposta.statusCode).toBe(422);
      expect(codigosDeCampo(resposta)).toEqual(['pagina:invalida']);
      expect(linhaDaChave('imoveis')).toBeUndefined();
    });

    it('exige sessão do painel para gravar', async () => {
      const resposta = await app.inject({
        method: 'PUT',
        url: '/api/v1/admin/textos/inicio',
        payload: { campos: { titulo: 'Sem sessão' } },
      });

      expect(resposta.statusCode).toBe(401);
      expect(resposta.json()).toEqual({ erro: 'nao_autenticado' });
      expect(camposSalvos('inicio').titulo).toBe(SEED_INICIO.titulo);
    });
  });

  describe('Tela /admin/textos', () => {
    it('mostra os formulários preenchidos com o texto atual', async () => {
      const resposta = await app.inject({ method: 'GET', url: '/admin/textos', headers: { cookie } });

      expect(resposta.statusCode).toBe(200);
      expect(resposta.headers['content-type']).toContain('text/html');
      expect(resposta.body).toContain('value="Título padrão"');
      expect(resposta.body).toContain('Frase padrão de apoio.');
      expect(resposta.body).toContain('Texto padrão do rodapé.');
      expect(resposta.body).toContain('action="/admin/textos/inicio"');
      expect(resposta.body).toContain('action="/admin/textos/rodape"');
      expect(resposta.body).toContain('name="descricao"');
      expect(resposta.body).toContain('name="texto"');
    });

    it('pede sessão antes de abrir a tela', async () => {
      const resposta = await app.inject({ method: 'GET', url: '/admin/textos' });

      expect(resposta.statusCode).toBe(302);
      expect(resposta.headers.location).toBe('/admin/login');
    });

    it('grava pelos formulários e volta com aviso de sucesso', async () => {
      const gravado = await enviarFormularioDeTexto('inicio', {
        titulo: 'Título vindo do painel.',
        descricao: 'Apoio vindo do painel.',
      });

      expect(gravado.statusCode).toBe(302);
      expect(gravado.headers.location).toBe('/admin/textos?feito=texto');

      const tela = await app.inject({
        method: 'GET',
        url: String(gravado.headers.location),
        headers: { cookie },
      });
      expect(tela.body).toContain('Texto gravado.');
      expect(tela.body).toContain('value="Título vindo do painel."');
      expect(tela.body).toContain('Apoio vindo do painel.');

      const rodape = await enviarFormularioDeTexto('rodape', {
        texto: 'Rodapé editado no painel.',
      });
      expect(rodape.statusCode).toBe(302);
      expect(camposSalvos('rodape').texto).toBe('Rodapé editado no painel.');
    });

    it('mostra o erro por campo sem perder o texto digitado', async () => {
      const resposta = await enviarFormularioDeTexto('inicio', { titulo: '', descricao: 'Ainda escrito.' });

      expect(resposta.statusCode).toBe(400);
      expect(resposta.body).toContain('Preenchimento obrigatório.');
      expect(resposta.body).toContain('Ainda escrito.');
      expect(camposSalvos('inicio').titulo).toBe(SEED_INICIO.titulo);
    });

    it('escapa o texto digitado em vez de executar como código', async () => {
      const resposta = await enviarFormularioDeTexto('inicio', {
        titulo: '<script>alert(1)</script>',
      });
      expect(resposta.statusCode).toBe(302);

      const publica = await app.inject({ method: 'GET', url: '/' });
      expect(publica.body).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
      expect(publica.body).not.toContain('<script>alert(1)</script>');

      const tela = await app.inject({
        method: 'GET',
        url: '/admin/textos',
        headers: { cookie },
      });
      expect(tela.body).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
      expect(tela.body).not.toContain('<script>alert(1)</script>');
    });

    it('devolve 404 para página sem texto editável', async () => {
      const resposta = await enviarFormularioDeTexto('secretaria', { titulo: 'Qualquer coisa' });

      expect(resposta.statusCode).toBe(404);
      expect(resposta.body).toBe('pagina_nao_editavel');
    });

    it('exige sessão nos formulários', async () => {
      const resposta = await enviarFormularioDeTexto('inicio', { titulo: 'Sem sessão' }, 'sessao=falsa');

      expect(resposta.statusCode).toBe(302);
      expect(resposta.headers.location).toBe('/admin/login');
    });
  });

  describe('Site público', () => {
    it('mostra na Início o texto salvo, sem sessão', async () => {
      await colocarTexto('inicio', { titulo: 'Título que veio do banco.', descricao: 'Apoio que veio do banco.' });

      const resposta = await app.inject({ method: 'GET', url: '/' });

      expect(resposta.statusCode).toBe(200);
      expect(resposta.headers['content-type']).toContain('text/html');
      expect(resposta.body).toContain('<h1>Título que veio do banco.</h1>');
      expect(resposta.body).toContain('Apoio que veio do banco.');
      expect(resposta.body).toContain('O método');
      expect(resposta.body).toContain('Praças');
      expect(resposta.body).toContain('Emirados Árabes Unidos');
      expect(resposta.body).not.toContain('undefined');
    });

    it('mostra no rodapé o texto salvo e mantém o aviso obrigatório', async () => {
      await colocarTexto('rodape', { texto: 'Rodapé que veio do banco.' });

      const resposta = await app.inject({ method: 'GET', url: '/' });

      expect(resposta.body).toContain('Rodapé que veio do banco.');
      // O texto editável substituiu a linha inteira; o aviso continua na página porque vem do código.
      expect(resposta.body).toContain(AVISO);
      expect(camposSalvos('rodape').aviso).toBeUndefined();
    });

    it('mostra o texto novo na hora, sem reiniciar o servidor', async () => {
      const primeira = await app.inject({ method: 'GET', url: '/' });
      expect(primeira.body).toContain('Título padrão');

      await colocarTexto('inicio', { titulo: 'Título trocado.' });

      const segunda = await app.inject({ method: 'GET', url: '/' });
      expect(segunda.body).toContain('<h1>Título trocado.</h1>');
      expect(segunda.body).not.toContain('Título padrão');
    });

    it('abre mesmo com a tabela vazia', async () => {
      conectarBanco().prepare('DELETE FROM textos_site').run();

      const resposta = await app.inject({ method: 'GET', url: '/' });

      expect(resposta.statusCode).toBe(200);
      expect(resposta.body).toContain(AVISO);
      expect(resposta.body).not.toContain('undefined');
    });

    it('não pede sessão para nenhuma página pública', async () => {
      const resposta = await app.inject({ method: 'GET', url: '/' });
      expect(resposta.statusCode).toBe(200);
    });
  });
});
