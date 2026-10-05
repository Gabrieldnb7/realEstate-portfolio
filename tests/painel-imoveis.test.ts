import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { FastifyInstance } from 'fastify';

const bancoTemporario = join(tmpdir(), `teste-painel-imoveis-${randomUUID()}.sqlite`);

process.env.DB_PATH = bancoTemporario;
process.env.NODE_ENV = 'test';
process.env.COOKIE_SECURE = 'false';
process.env.SESSAO_TTL_SEGUNDOS = '3600';
process.env.SEGREDO_APP = 'segredo-de-teste-com-mais-de-trinta-bits-ok';

const { buildApp } = await import('../src/app.js');
const { conectarBanco, fecharBanco } = await import('../src/infra/db.js');
const { executarMigracoes } = await import('../scripts/migrar.js');
const { criarHashSenha } = await import('../src/repositories/seguranca/senhas.js');

const EMAIL_ADMIN = 'admin@exemplo.com';
const SENHA_ADMIN = 'senhaSegura123';

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

function textoDeCamposJson(campos: Record<string, unknown>): string {
  const { preco, ...restantes } = campos;
  const pares: [string, string][] = Object.entries(restantes).map(([campo, valor]) => [
    campo,
    valor === undefined || valor === null ? '' : String(valor),
  ]);

  if (preco && typeof preco === 'object') {
    const { valor = '', moeda = '' } = preco as { valor?: string; moeda?: string };
    pares.push(['preco_valor', valor], ['preco_moeda', moeda]);
  }

  return new URLSearchParams(pares).toString();
}

describe('Cadastro, edição e transição de imóveis', () => {
  let app: FastifyInstance;
  let cookie = '';

  function linhaDeImovel(id: string): Record<string, unknown> {
    return conectarBanco().prepare('SELECT * FROM imoveis WHERE id = ?').get(id) as Record<string, unknown>;
  }

  function adicionarFoto(imovelId: string, alt: string, ordem = 0): void {
    conectarBanco()
      .prepare('INSERT INTO imagens (id, imovel_id, url, alt, ordem, criado_em) VALUES (?, ?, ?, ?, ?, ?)')
      .run(randomUUID(), imovelId, `/media/foto-${ordem + 1}.jpg`, alt, ordem, new Date().toISOString());
  }

  function camposDaResposta(resposta: { json: () => unknown }): Record<string, unknown> {
    return resposta.json() as Record<string, unknown>;
  }

  function codigosDeCampo(resposta: { json: () => unknown }): string[] {
    const corpo = camposDaResposta(resposta) as { campos: { campo: string }[] };
    return corpo.campos.map((erro) => erro.campo);
  }

  async function criar(corpo: Record<string, unknown>, cookieSessao = cookie) {
    return app.inject({ method: 'POST', url: '/api/v1/admin/imoveis', payload: corpo, headers: { cookie: cookieSessao } });
  }

  async function enviarFormulario(url: string, campos: Record<string, unknown>, cookieSessao = cookie) {
    return app.inject({
      method: 'POST',
      url,
      headers: { cookie: cookieSessao, 'content-type': 'application/x-www-form-urlencoded' },
      payload: textoDeCamposJson(campos),
    });
  }

  async function mudarSituacao(id: string, situacao: string, cookieSessao = cookie) {
    return app.inject({
      method: 'POST',
      url: `/api/v1/admin/imoveis/${id}/situacao`,
      payload: { situacao },
      headers: { cookie: cookieSessao },
    });
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
  });

  describe('API JSON', () => {
    it('recusa corpo que não é objeto com 400 requisicao_invalida', async () => {
      const resposta = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/imoveis',
        headers: { cookie, 'content-type': 'application/json' },
        payload: '[1,2]',
      });

      expect(resposta.statusCode).toBe(400);
      expect(camposDaResposta(resposta).erro).toBe('requisicao_invalida');
    });

    it('cria como rascunho mesmo quando o corpo pede publicação', async () => {
      const resposta = await criar({ ...APARTAMENTO, situacao: 'publicado' });

      expect(resposta.statusCode).toBe(201);
      const corpo = camposDaResposta(resposta);
      expect(corpo).toEqual({
        id: expect.any(String),
        ref: 'BR-1001',
        slug: 'br-1001-apartamento-na-ponta-negra',
        situacao: 'rascunho',
      });

      const linha = linhaDeImovel(corpo.id as string);
      expect(linha.situacao).toBe('rascunho');
      expect(linha.preco_valor).toBe('1250000.00');
      expect(linha.area_privativa).toBe('120.50');
      expect(linha.andar).toBe(12);
      expect(linha.criado_em).toBe(linha.atualizado_em);
    });

    it('acumula um erro por campo obrigatório e não grava nada', async () => {
      const resposta = await criar({ tipologia: 'apartamento' });

      expect(resposta.statusCode).toBe(422);
      expect(camposDaResposta(resposta).erro).toBe('dados_invalidos');
      expect(codigosDeCampo(resposta)).toEqual(
        expect.arrayContaining(['ref', 'titulo', 'cidade', 'bairro', 'descricao', 'parceiro', 'quartos'])
      );
      expect(conectarBanco().prepare('SELECT COUNT(*) AS total FROM imoveis').get()).toEqual({ total: 0 });
    });

    it('aplica as regras da tipologia antes de gravar', async () => {
      const semTerreno = await criar({ ...VILLA, areaTerreno: '' });
      expect(semTerreno.statusCode).toBe(422);
      expect(codigosDeCampo(semTerreno)).toContain('areaTerreno');

      const semAndar = await criar({ ...APARTAMENTO, andar: '' });
      expect(semAndar.statusCode).toBe(422);
      expect(codigosDeCampo(semAndar)).toContain('andar');

      const villaValida = await criar(VILLA);
      expect(villaValida.statusCode).toBe(201);
      expect(linhaDeImovel(camposDaResposta(villaValida).id as string).area_terreno).toBe('480');
    });

    it('não deixa moeda fora da praça nem referência duplicada', async () => {
      await criar(APARTAMENTO);

      const moedaTrocada = await criar({
        ...APARTAMENTO,
        ref: 'BR-1002',
        preco: { valor: '10.00', moeda: 'USD' },
      });
      expect(moedaTrocada.statusCode).toBe(422);
      expect(codigosDeCampo(moedaTrocada)).toContain('preco');

      const duplicada = await criar(APARTAMENTO);
      expect(duplicada.statusCode).toBe(422);
      expect(duplicada.json()).toEqual({ erro: 'dados_invalidos', campos: [{ campo: 'ref', codigo: 'duplicado' }] });
    });

    it('não repete slug quando outro imóvel já usa o mesmo endereço', async () => {
      const primeiro = await criar({ ...APARTAMENTO, ref: 'BR-9000' });
      // Simula um registro vindo de outra origem: referência própria, slug alheio ocupado.
      conectarBanco()
        .prepare('UPDATE imoveis SET slug = ? WHERE id = ?')
        .run('br-1001-apartamento-na-ponta-negra', camposDaResposta(primeiro).id as string);

      const resposta = await criar(APARTAMENTO);
      expect(resposta.statusCode).toBe(201);
      expect(camposDaResposta(resposta).slug).toBe('br-1001-apartamento-na-ponta-negra-2');
    });

    it('edita só o que chegou no corpo e preserva slug e situação', async () => {
      const criado = await criar(APARTAMENTO);
      const { id, slug } = camposDaResposta(criado) as { id: string; slug: string };
      adicionarFoto(id, 'Sala de estar');
      await mudarSituacao(id, 'publicado');

      const resposta = await app.inject({
        method: 'PATCH',
        url: `/api/v1/admin/imoveis/${id}`,
        payload: { preco: { valor: '980000.00', moeda: 'BRL' } },
        headers: { cookie },
      });

      expect(resposta.statusCode).toBe(200);
      expect(resposta.json()).toEqual({ id, ref: 'BR-1001', slug, situacao: 'publicado' });

      const linha = linhaDeImovel(id);
      expect(linha.preco_valor).toBe('980000.00');
      expect(linha.titulo).toBe(APARTAMENTO.titulo);
      expect(linha.cidade).toBe(APARTAMENTO.cidade);
    });

    it('devolve 404 ao editar ou publicar imóvel que não existe', async () => {
      const inexistente = randomUUID();

      const edicao = await app.inject({
        method: 'PATCH',
        url: `/api/v1/admin/imoveis/${inexistente}`,
        payload: { titulo: 'Nada' },
        headers: { cookie },
      });
      expect(edicao.statusCode).toBe(404);
      expect(edicao.json()).toEqual({ erro: 'imovel_nao_encontrado' });

      const situacao = await mudarSituacao(inexistente, 'publicado');
      expect(situacao.statusCode).toBe(404);
    });

    it('só publica com pelo menos uma foto e todas as fotos descritas', async () => {
      const { id } = (await criar(APARTAMENTO)).json() as { id: string };

      const semFoto = await mudarSituacao(id, 'publicado');
      expect(semFoto.statusCode).toBe(422);
      expect(semFoto.json()).toEqual({
        erro: 'dados_invalidos',
        campos: [{ campo: 'imagens', codigo: 'fotos_obrigatorias_para_publicacao' }],
      });

      adicionarFoto(id, '');
      const semDescricao = await mudarSituacao(id, 'publicado');
      expect(semDescricao.statusCode).toBe(422);

      conectarBanco().prepare('UPDATE imagens SET alt = ? WHERE imovel_id = ?').run('Fachada', id);
      const publicada = await mudarSituacao(id, 'publicado');
      expect(publicada.statusCode).toBe(200);
      expect(camposDaResposta(publicada)).toEqual({ id, ref: 'BR-1001', slug: expect.any(String), situacao: 'publicado' });
      expect(linhaDeImovel(id).situacao).toBe('publicado');
    });

    it('não mexe em imóvel vendido e rejeita situação que não existe', async () => {
      const { id } = (await criar(APARTAMENTO)).json() as { id: string };
      adicionarFoto(id, 'Fachada');
      await mudarSituacao(id, 'publicado');
      await mudarSituacao(id, 'vendido');

      const tentativa = await mudarSituacao(id, 'publicado');
      expect(tentativa.statusCode).toBe(422);
      expect(tentativa.json()).toEqual({
        erro: 'dados_invalidos',
        campos: [{ campo: 'situacao', codigo: 'vendido_imutavel' }],
      });

      const inventada = await mudarSituacao(id, 'em-cartorio');
      expect(inventada.statusCode).toBe(422);
      expect(inventada.json()).toEqual({
        erro: 'dados_invalidos',
        campos: [{ campo: 'situacao', codigo: 'invalida' }],
      });
    });

    it('mantém a API e as páginas do painel atrás da sessão', async () => {
      const semCookie = await app.inject({ method: 'POST', url: '/api/v1/admin/imoveis', payload: APARTAMENTO });
      expect(semCookie.statusCode).toBe(401);
      expect(semCookie.json()).toEqual({ erro: 'nao_autenticado' });

      const pagina = await app.inject({ method: 'GET', url: '/admin' });
      expect(pagina.statusCode).toBe(302);
      expect(pagina.headers.location).toBe('/admin/login');
    });
  });

  describe('Páginas do painel', () => {
    it('loga, cria e sai pelo formulário, sempre sem JavaScript', async () => {
      const login = await app.inject({
        method: 'POST',
        url: '/admin/login',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        payload: new URLSearchParams({ email: EMAIL_ADMIN, senha: SENHA_ADMIN }).toString(),
      });
      expect(login.statusCode).toBe(302);
      expect(login.headers.location).toBe('/admin');
      expect(String(login.headers['set-cookie'])).toContain('HttpOnly');
      const cookieDoFormulario = String(login.headers['set-cookie']).split(';')[0]!;

      const lista = await app.inject({ method: 'GET', url: '/admin', headers: { cookie: cookieDoFormulario } });
      expect(lista.statusCode).toBe(200);
      expect(lista.headers['content-type']).toContain('text/html');
      expect(lista.body).toContain('Nenhum imóvel cadastrado');

      const criado = await enviarFormulario('/admin/imoveis/novo', APARTAMENTO, cookieDoFormulario);
      expect(criado.statusCode).toBe(302);
      const id = /\/admin\/imoveis\/([^/]+)\/editar/.exec(criado.headers.location as string)?.[1]!;
      expect(criado.headers.location).toBe(`/admin/imoveis/${id}/editar?feito=salvo`);
      expect(linhaDeImovel(id).ref).toBe('BR-1001');

      const reapresentada = await app.inject({ method: 'GET', url: '/admin', headers: { cookie: cookieDoFormulario } });
      expect(reapresentada.body).toContain('BR-1001');
      expect(reapresentada.body).toContain('Apartamento na Ponta Negra');
      expect(reapresentada.body).toContain(`/admin/imoveis/${id}/editar`);

      const sessoesAntes = conectarBanco()
        .prepare('SELECT COUNT(*) AS total FROM sessoes')
        .get() as { total: number };
      const sair = await app.inject({ method: 'POST', url: '/admin/logout', headers: { cookie: cookieDoFormulario } });
      expect(sair.statusCode).toBe(302);
      expect(sair.headers.location).toBe('/admin/login');

      // Sai só a sessão deste formulário; a sessão da API usada nos outros testes continua viva.
      const sessoesDepois = conectarBanco()
        .prepare('SELECT COUNT(*) AS total FROM sessoes')
        .get() as { total: number };
      expect(sessoesDepois.total).toBe(sessoesAntes.total - 1);

      const depoisDeSair = await app.inject({ method: 'GET', url: '/admin', headers: { cookie: cookieDoFormulario } });
      expect(depoisDeSair.statusCode).toBe(302);
    });

    it('mostra as medidas certas para cada tipologia', async () => {
      const comparativos: [string, string, string][] = [
        ['apartamento', 'name="areaPrivativa"', 'name="areaTerreno"'],
        ['villa', 'name="areaTerreno"', 'name="andar"'],
      ];

      for (const [tipologia, esperado, descartado] of comparativos) {
        const resposta = await app.inject({
          method: 'GET',
          url: `/admin/imoveis/novo?tipologia=${tipologia}`,
          headers: { cookie },
        });

        expect(resposta.statusCode).toBe(200);
        expect(resposta.body).toContain(`name="tipologia" value="${tipologia}"`);
        expect(resposta.body).toContain(esperado);
        expect(resposta.body).not.toContain(descartado);
      }
    });

    it('re-renderiza o formulário com um erro por campo e com o que foi digitado', async () => {
      const resposta = await enviarFormulario('/admin/imoveis/novo', {
        ...APARTAMENTO,
        titulo: 'Sala <script>alert(1)</script>',
        areaPrivativa: 'abc',
        quartos: '',
      });

      expect(resposta.statusCode).toBe(422);
      expect(resposta.body).toContain('Preenchimento obrigatório');
      expect(resposta.body).toContain('até duas casas decimais');
      expect(resposta.body).toContain('value="BR-1001"');
      // O que a pessoa digitou sai escapado: nada vira código executável para outro visitante.
      expect(resposta.body).not.toContain('<script>alert(1)</script>');
      expect(resposta.body).toContain('&lt;script&gt;');
    });

    it('deixa trocar a tipologia na edição, sem perder o que já está salvo', async () => {
      const { id } = (await criar(APARTAMENTO)).json() as { id: string };

      const resposta = await app.inject({
        method: 'GET',
        url: `/admin/imoveis/${id}/editar?tipologia=villa`,
        headers: { cookie },
      });

      expect(resposta.statusCode).toBe(200);
      expect(resposta.body).toContain('name="tipologia" value="villa"');
      expect(resposta.body).toContain('name="areaTerreno"');
      expect(resposta.body).toContain('value="Apartamento na Ponta Negra"');

      const gravada = await app.inject({
        method: 'POST',
        url: `/admin/imoveis/${id}/editar`,
        headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
        payload: textoDeCamposJson({ ...VILLA, ref: 'BR-1001', tipologia: 'villa' }),
      });
      expect(gravada.statusCode).toBe(302);

      const linha = linhaDeImovel(id);
      expect(linha.tipologia).toBe('villa');
      // As medidas do apartamento não acompanham a nova tipologia.
      expect(linha.area_privativa).toBeNull();
      expect(linha.andar).toBeNull();
      expect(linha.area_terreno).toBe('480');
      // O endereço antigo continua valendo.
      expect(linha.slug).toBe('br-1001-apartamento-na-ponta-negra');
    });

    it('explica na tela o conflito entre praça e moeda, não só no status', async () => {
      const { id } = (await criar(APARTAMENTO)).json() as { id: string };

      const resposta = await enviarFormulario(`/admin/imoveis/${id}/editar`, {
        ...APARTAMENTO,
        preco: { valor: '1250000.00', moeda: 'USD' },
      });

      expect(resposta.statusCode).toBe(422);
      expect(resposta.body).toContain('Moeda incompatível para o país BR');
      expect(resposta.body).toContain('<h1>Editar BR-1001</h1>');
      // O que foi digitado continua na tela para corrigir.
      expect(resposta.body).toContain('<option value="USD" selected>USD</option>');
      expect(linhaDeImovel(id).preco_moeda).toBe('BRL');
    });

    it('mostra na lista o resultado de uma transição feita pelo formulário', async () => {
      const { id } = (await criar(APARTAMENTO)).json() as { id: string };

      const bloqueada = await enviarFormulario(`/admin/imoveis/${id}/situacao`, { situacao: 'publicado' });
      expect(bloqueada.statusCode).toBe(302);
      expect(bloqueada.headers.location).toBe('/admin?erro=fotos_obrigatorias_para_publicacao');

      const aviso = await app.inject({ method: 'GET', url: '/admin?erro=fotos_obrigatorias_para_publicacao', headers: { cookie } });
      expect(aviso.body).toContain('pelo menos uma foto');

      adicionarFoto(id, 'Vista da varanda');
      const publicada = await enviarFormulario(`/admin/imoveis/${id}/situacao`, { situacao: 'publicado' });
      expect(publicada.statusCode).toBe(302);
      expect(publicada.headers.location).toBe('/admin?feito=situacao');

      const lista = await app.inject({ method: 'GET', url: '/admin?feito=situacao', headers: { cookie } });
      expect(lista.body).toContain('Situação atualizada');
      expect(lista.body).toContain('<td>publicado</td>');

      const editar = await app.inject({ method: 'GET', url: `/admin/imoveis/${id}/editar`, headers: { cookie } });
      expect(editar.statusCode).toBe(200);
      expect(editar.body).toContain('value="Apartamento na Ponta Negra"');
      expect(editar.body).toContain('Situação e publicação');
      expect(editar.body).toContain('Fotos cadastradas: 1');

      const recusada = await enviarFormulario(`/admin/imoveis/${id}/situacao`, { situacao: 'inventada' });
      expect(recusada.headers.location).toBe('/admin?erro=invalida');
    });

    it('devolve 404 na página de imóvel que não existe', async () => {
      const resposta = await app.inject({
        method: 'GET',
        url: `/admin/imoveis/${randomUUID()}/editar`,
        headers: { cookie },
      });

      expect(resposta.statusCode).toBe(404);
      expect(resposta.body).toContain('imovel_nao_encontrado');
    });
  });
});
