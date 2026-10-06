import { randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { FastifyInstance } from 'fastify';

const bancoTemporario = join(tmpdir(), `teste-exclusao-${randomUUID()}.sqlite`);
const pastaUploads = mkdtempSync(join(tmpdir(), 'uploads-exclusao-'));

process.env.DB_PATH = bancoTemporario;
process.env.UPLOAD_DIR = pastaUploads;
process.env.NODE_ENV = 'test';
process.env.COOKIE_SECURE = 'false';
process.env.SESSAO_TTL_SEGUNDOS = '3600';
process.env.SEGREDO_APP = 'segredo-de-teste-com-mais-de-trinta-bits-ok';
process.env.WHATSAPP_E164 = '5511999999999';

const { buildApp } = await import('../src/app.js');
const { conectarBanco, fecharBanco } = await import('../src/infra/db.js');
const { executarMigracoes } = await import('../scripts/migrar.js');
const { criarHashSenha } = await import('../src/repositories/seguranca/senhas.js');

const EMAIL_ADMIN = 'admin@exemplo.com';
const SENHA_ADMIN = 'senhaSegura123';
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('corpo-da-foto', 'utf8')]);

const APARTAMENTO: Record<string, unknown> = {
  ref: 'BR-1001',
  titulo: 'Apartamento na Ponta Negra',
  tipologia: 'apartamento',
  pais: 'BR',
  cidade: 'Manaus',
  bairro: 'Ponta Negra',
  descricao: 'Frente mar, varanda ampla.',
  preco: { valor: '1250000.00', moeda: 'BRL' },
  areaPrivativa: '120.50',
  quartos: 3,
  banheiros: 2,
  vagas: 2,
  andar: 12,
  parceiro: 'Local Sul 01',
};

const VILLA: Record<string, unknown> = {
  ref: 'PA-2002',
  titulo: 'Villa en la Bahia',
  tipologia: 'villa',
  pais: 'PA',
  cidade: 'Ciudad de Panama',
  bairro: 'San Francisco',
  descricao: 'Casa térrea com piscina.',
  preco: { valor: '2400000.00', moeda: 'USD' },
  areaConstruida: '310',
  areaTerreno: '480',
  quartos: 4,
  parceiro: 'Colmed 03',
};

function corpoMultipart(campos: Record<string, string>): { payload: Buffer; limite: string } {
  const limite = `limite${randomUUID().replace(/-/g, '')}`;
  const pedacos: Buffer[] = [];

  for (const [nome, valor] of Object.entries(campos)) {
    pedacos.push(
      Buffer.from(
        `--${limite}\r\nContent-Disposition: form-data; name="${nome}"\r\n\r\n${valor}\r\n`,
        'utf8'
      )
    );
  }

  pedacos.push(
    Buffer.from(
      `--${limite}\r\nContent-Disposition: form-data; name="arquivo"; filename="fachada.jpg"\r\n` +
        'Content-Type: image/jpeg\r\n\r\n',
      'utf8'
    ),
    JPEG,
    Buffer.from('\r\n', 'utf8'),
    Buffer.from(`--${limite}--\r\n`, 'utf8')
  );

  return { payload: Buffer.concat(pedacos), limite };
}

describe('Detalhamento, filtros e exclusão de imóvel no painel', () => {
  let app: FastifyInstance;
  let cookie = '';

  async function criarImovel(corpo: Record<string, unknown>): Promise<string> {
    const resposta = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/imoveis',
      payload: corpo,
      headers: { cookie },
    });

    return (resposta.json() as { id: string }).id;
  }

  async function enviarFoto(imovelId: string): Promise<string> {
    const { payload, limite } = corpoMultipart({ alt: 'Fachada do prédio' });
    const resposta = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/imoveis/${imovelId}/imagens`,
      headers: { cookie, 'content-type': `multipart/form-data; boundary=${limite}` },
      payload,
    });

    return (resposta.json() as { url: string }).url;
  }

  async function mudarSituacao(imovelId: string, situacao: string) {
    return app.inject({
      method: 'POST',
      url: `/api/v1/admin/imoveis/${imovelId}/situacao`,
      payload: { situacao },
      headers: { cookie },
    });
  }

  function pedir(url: string) {
    return app.inject({ method: 'GET', url, headers: { cookie } });
  }

  function contar(tabela: string): number {
    return (conectarBanco().prepare(`SELECT COUNT(*) AS total FROM ${tabela}`).get() as { total: number })
      .total;
  }

  function refsDaLista(body: string): string[] {
    return [...body.matchAll(/<td class="celula-ref">([A-Z]{2}-\d{4})<\/td>/g)].map((bate) => bate[1]!);
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
    const db = conectarBanco();
    db.prepare('DELETE FROM imagens').run();
    db.prepare('DELETE FROM imoveis').run();
  });

  afterAll(async () => {
    await app.close();
    fecharBanco();
    for (const sufixo of ['', '-wal', '-shm']) {
      rmSync(`${bancoTemporario}${sufixo}`, { force: true });
    }
    rmSync(pastaUploads, { recursive: true, force: true });
  });

  describe('Bloco de detalhamento', () => {
    it('mostra busca, contagem e as duas ações de cada linha', async () => {
      await criarImovel(APARTAMENTO);
      await criarImovel(VILLA);

      const lista = await pedir('/admin');

      expect(lista.body).toContain('Detalhamento dos imóveis');
      expect(lista.body).toContain('name="busca"');
      expect(lista.body).toContain('Exibindo 2 de 2 imóveis.');
      expect(refsDaLista(lista.body).sort()).toEqual(['BR-1001', 'PA-2002']);
      expect(lista.body).toContain('/excluir');
      expect(lista.body).toContain('>Excluir</button>');
      expect(lista.body).toContain('>Editar</a>');
    });

    it('filtra por situação e marca a opção ativa na coluna lateral', async () => {
      await criarImovel(APARTAMENTO);
      const villa = await criarImovel(VILLA);
      await enviarFoto(villa);
      await mudarSituacao(villa, 'publicado');

      const lista = await pedir('/admin?situacao=publicado');

      expect(refsDaLista(lista.body)).toEqual(['PA-2002']);
      expect(lista.body).toContain('Exibindo 1 de 2 imóveis.');
      expect(lista.body).toContain('filtro-item-ativo');
      expect(lista.body).toContain('aria-current="true"');
      // A opção ativa desmarca ao clicar de novo; a outra continua sendo um filtro novo.
      expect(lista.body).toContain('href="/admin?situacao=rascunho"');
    });

    it('busca por texto e mantém o filtro na URL', async () => {
      await criarImovel(APARTAMENTO);
      await criarImovel(VILLA);

      const lista = await pedir('/admin?busca=2002&pais=PA');

      expect(refsDaLista(lista.body)).toEqual(['PA-2002']);
      expect(lista.body).toContain('value="2002"');
      expect(lista.body).toContain('name="pais" value="PA"');
      expect(lista.body).toContain('class="filtro-item filtro-item-ativo"');
      expect(lista.body).toContain('href="/admin?busca=2002"');
    });

    it('trata como ausente o valor de filtro que o catálogo não conhece', async () => {
      await criarImovel(APARTAMENTO);

      const lista = await pedir('/admin?situacao=alugada');

      expect(lista.statusCode).toBe(200);
      expect(refsDaLista(lista.body)).toEqual(['BR-1001']);
      expect(lista.body).toContain('href="/admin"');
    });

    it('diz que não há imóvel quando a lista está vazia', async () => {
      const lista = await pedir('/admin');

      expect(lista.body).toContain('Nenhum imóvel cadastrado');
      expect(lista.body).toContain('Exibindo 0 de 0 imóveis.');
    });

    it('mostra os indicadores do conjunto filtrado', async () => {
      await criarImovel(APARTAMENTO);
      const villa = await criarImovel(VILLA);
      await enviarFoto(villa);
      await mudarSituacao(villa, 'publicado');

      const lista = await pedir('/admin');

      expect(lista.body).toContain('Imóveis listados');
      expect(lista.body).toContain('Publicados');
      expect(lista.body).toContain('Em rascunho');
      expect(lista.body).toContain('Fora do ar');
    });
  });

  describe('Exclusão pelo painel', () => {
    it('exclui imóvel, imagens e arquivo em um POST só', async () => {
      const id = await criarImovel(APARTAMENTO);
      const url = await enviarFoto(id);

      const excluida = await app.inject({
        method: 'POST',
        url: `/admin/imoveis/${id}/excluir`,
        headers: { cookie },
      });

      expect(excluida.statusCode).toBe(302);
      expect(excluida.headers.location).toBe('/admin?feito=excluido');
      expect(contar('imoveis')).toBe(0);
      expect(contar('imagens')).toBe(0);
      expect(existsSync(join(pastaUploads, url.replace('/media/', '')))).toBe(false);

      const lista = await pedir('/admin?feito=excluido');
      expect(lista.body).toContain('Imóvel excluído.');
    });

    it('tira o imóvel publicado do catálogo e faz a ficha responder 404', async () => {
      const id = await criarImovel(APARTAMENTO);
      await enviarFoto(id);
      await mudarSituacao(id, 'publicado');

      expect((await pedir('/imoveis')).body).toContain('Apartamento na Ponta Negra');

      await app.inject({ method: 'POST', url: `/admin/imoveis/${id}/excluir`, headers: { cookie } });

      const catalogo = await pedir('/imoveis');
      expect(catalogo.body).not.toContain('Apartamento na Ponta Negra');
      expect((await pedir('/imoveis/br-1001-apartamento-na-ponta-negra')).statusCode).toBe(404);
    });

    it('devolve 404 e não apaga nada quando o imóvel não existe', async () => {
      await criarImovel(APARTAMENTO);

      const resposta = await app.inject({
        method: 'POST',
        url: `/admin/imoveis/${randomUUID()}/excluir`,
        headers: { cookie },
      });

      expect(resposta.statusCode).toBe(404);
      expect(resposta.body).toBe('imovel_nao_encontrado');
      expect(contar('imoveis')).toBe(1);
      expect(refsDaLista((await pedir('/admin')).body)).toEqual(['BR-1001']);
    });

    it('pede sessão antes de excluir, pelo painel e pela API', async () => {
      const id = await criarImovel(APARTAMENTO);

      const semCookie = await app.inject({ method: 'POST', url: `/admin/imoveis/${id}/excluir` });
      expect(semCookie.statusCode).toBe(302);
      expect(semCookie.headers.location).toBe('/admin/login');

      const apiSemCookie = await app.inject({ method: 'DELETE', url: `/api/v1/admin/imoveis/${id}` });
      expect(apiSemCookie.statusCode).toBe(401);
      expect(apiSemCookie.json()).toEqual({ erro: 'nao_autenticado' });

      expect(contar('imoveis')).toBe(1);
    });
  });

  describe('DELETE /api/v1/admin/imoveis/:id', () => {
    it('responde 204 e remove o registro', async () => {
      const id = await criarImovel(APARTAMENTO);

      const resposta = await app.inject({ method: 'DELETE', url: `/api/v1/admin/imoveis/${id}`, headers: { cookie } });

      expect(resposta.statusCode).toBe(204);
      expect(resposta.body).toBe('');
      expect(contar('imoveis')).toBe(0);
    });

    it('responde 404 para imóvel que não existe', async () => {
      const resposta = await app.inject({
        method: 'DELETE',
        url: `/api/v1/admin/imoveis/${randomUUID()}`,
        headers: { cookie },
      });

      expect(resposta.statusCode).toBe(404);
      expect(resposta.json()).toEqual({ erro: 'imovel_nao_encontrado' });
    });
  });
});
