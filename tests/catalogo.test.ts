import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { FastifyInstance } from 'fastify';

const bancoTemporario = join(tmpdir(), `teste-catalogo-${randomUUID()}.sqlite`);

process.env.DB_PATH = bancoTemporario;
process.env.NODE_ENV = 'test';
process.env.COOKIE_SECURE = 'false';
process.env.SESSAO_TTL_SEGUNDOS = '3600';
process.env.SEGREDO_APP = 'segredo-de-teste-com-mais-de-trinta-bits-ok';

const { buildApp } = await import('../src/app.js');
const { conectarBanco, fecharBanco } = await import('../src/infra/db.js');
const { executarMigracoes } = await import('../scripts/migrar.js');
const { MOEDA_POR_PRACA } = await import('../src/entities/index.js');

const AVISO = 'Projeto de avaliação técnica. Imóveis, valores e contatos fictícios.';

interface Semente {
  ref: string;
  pais: 'BR' | 'PA' | 'AE';
  situacao: string;
  cidade?: string;
  bairro?: string;
  titulo?: string;
  preco?: string | null;
  criado?: string;
  fotos?: { url: string; alt: string; ordem: number }[];
}

// Dois imóveis nasceram no mesmo instante de propósito: é assim que o seed se comporta, e a
// ordenação precisa continuar determinística.
const CATALOGO: Semente[] = [
  {
    ref: 'BR-0101',
    pais: 'BR',
    situacao: 'publicado',
    cidade: 'São Paulo',
    bairro: 'Jardins',
    titulo: 'Apartamento Alameda Lorena',
    preco: '4850000.10',
    criado: '2026-01-01T10:00:00.000Z',
    fotos: [
      { url: '/media/cinco.webp', alt: 'Sala de estar', ordem: 5 },
      { url: '/media/um.webp', alt: 'Fachada do prédio', ordem: 1 },
    ],
  },
  {
    ref: 'BR-0102',
    pais: 'BR',
    situacao: 'publicado',
    cidade: 'Rio de Janeiro',
    bairro: 'Botafogo',
    titulo: 'Casa sem foto no ar',
    preco: '1000000.00',
    criado: '2026-02-01T10:00:00.000Z',
  },
  {
    ref: 'PA-0201',
    pais: 'PA',
    situacao: 'reservado',
    cidade: 'Cidade do Panamá',
    bairro: 'Costa del Este',
    titulo: 'Villa Costa del Este',
    preco: '900000.00',
    criado: '2026-03-01T10:00:00.000Z',
    fotos: [{ url: '/media/pa.webp', alt: 'Piscina', ordem: 0 }],
  },
  {
    ref: 'AE-0301',
    pais: 'AE',
    situacao: 'vendido',
    cidade: 'Dubai',
    bairro: 'Downtown',
    titulo: 'Penthouse Downtown',
    preco: '2500000.00',
    criado: '2026-04-01T10:00:00.000Z',
    fotos: [{ url: '/media/ae.webp', alt: 'Vista da cidade', ordem: 0 }],
  },
  {
    ref: 'BR-0103',
    pais: 'BR',
    situacao: 'rascunho',
    cidade: 'Porto Feliz',
    bairro: 'Centro',
    titulo: 'Estate em rascunho',
    preco: '500000.00',
    criado: '2026-05-01T10:00:00.000Z',
  },
  {
    ref: 'PA-0202',
    pais: 'PA',
    situacao: 'arquivado',
    cidade: 'Cerro Azul',
    bairro: 'Montanha',
    titulo: 'Estate arquivado',
    preco: '700000.00',
    criado: '2026-06-01T10:00:00.000Z',
  },
  {
    ref: 'AE-0302',
    pais: 'AE',
    situacao: 'publicado',
    cidade: 'Dubai',
    bairro: 'Marina',
    titulo: 'Apartamento sem preço',
    preco: null,
    criado: '2026-08-01T10:00:00.000Z',
    fotos: [{ url: '/media/marina.webp', alt: 'Marina', ordem: 0 }],
  },
  {
    ref: 'PA-0203',
    pais: 'PA',
    situacao: 'publicado',
    cidade: 'Coronado',
    bairro: 'Praia',
    titulo: 'Villa Coronado',
    preco: '1200000.50',
    criado: '2026-08-01T10:00:00.000Z',
    fotos: [{ url: '/media/coronado.webp', alt: 'Beira-mar', ordem: 0 }],
  },
];

const VISIVEIS = ['BR-0101', 'BR-0102', 'PA-0201', 'AE-0301', 'AE-0302', 'PA-0203'];
// Mesmo criado_em em AE-0302 e PA-0203: o desempate sai da referência.
const NA_ORDEM_RECENTES = ['AE-0302', 'PA-0203', 'AE-0301', 'PA-0201', 'BR-0102', 'BR-0101'];
const NA_ORDEM_PRECO_ASC = ['PA-0201', 'BR-0102', 'PA-0203', 'AE-0301', 'BR-0101', 'AE-0302'];
const NA_ORDEM_PRECO_DESC = ['BR-0101', 'AE-0301', 'PA-0203', 'BR-0102', 'PA-0201', 'AE-0302'];

interface ItemApi {
  ref: string;
  slug: string;
  titulo: string;
  tipologia: string;
  situacao: string;
  pais: string;
  cidade: string;
  bairro: string;
  preco: { valor: string; moeda: string } | null;
  capa: { url: string; alt: string } | null;
}

describe('Catálogo público com filtro e ordenação', () => {
  let app: FastifyInstance;

  function semearImovel(semente: Semente): void {
    const id = randomUUID();
    const agora = new Date().toISOString();
    const criado = semente.criado ?? agora;

    conectarBanco()
      .prepare(
        `INSERT INTO imoveis (
           id, ref, slug, titulo, tipologia, pais, cidade, bairro, descricao,
           preco_valor, preco_moeda, area_privativa, area_construida, area_terreno,
           quartos, banheiros, vagas, andar, parceiro, situacao, criado_em, atualizado_em
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        semente.ref,
        semente.ref.toLowerCase(),
        semente.titulo ?? `Imóvel ${semente.ref}`,
        'apartamento',
        semente.pais,
        semente.cidade ?? 'Cidade',
        semente.bairro ?? 'Bairro',
        'Descrição do imóvel.',
        semente.preco ?? null,
        semente.preco ? MOEDA_POR_PRACA[semente.pais] : null,
        '199.74',
        null,
        null,
        3,
        3,
        2,
        14,
        'Parceiro Local',
        semente.situacao,
        criado,
        criado
      );

    for (const foto of semente.fotos ?? []) {
      conectarBanco()
        .prepare(
          'INSERT INTO imagens (id, imovel_id, url, alt, ordem, criado_em) VALUES (?, ?, ?, ?, ?, ?)'
        )
        .run(randomUUID(), id, foto.url, foto.alt, foto.ordem, agora);
    }
  }

  function consultarApi(query = '') {
    return app.inject({ method: 'GET', url: `/api/v1/imoveis${query}` });
  }

  function itensDaApi(resposta: { json: () => unknown }): ItemApi[] {
    const corpo = resposta.json() as { itens?: ItemApi[] };
    return corpo.itens ?? [];
  }

  function refsDaApi(resposta: { json: () => unknown }): string[] {
    return itensDaApi(resposta).map((item) => item.ref);
  }

  function pedirPagina(url: string) {
    return app.inject({ method: 'GET', url });
  }

  function refsDaPagina(body: string): string[] {
    return [...body.matchAll(/<a class="cartao" href="\/imoveis\/([a-z0-9-]+)"/g)].map(
      (bate) => (bate[1] ?? '').toUpperCase()
    );
  }

  beforeAll(async () => {
    executarMigracoes();
    app = await buildApp();
    await app.ready();
  });

  beforeEach(() => {
    conectarBanco().prepare('DELETE FROM imagens').run();
    conectarBanco().prepare('DELETE FROM imoveis').run();
    for (const semente of CATALOGO) semearImovel(semente);
  });

  afterAll(async () => {
    await app.close();
    fecharBanco();
    rmSync(bancoTemporario, { force: true });
  });

  describe('API pública GET /api/v1/imoveis', () => {
    it('responde 200 sem sessão e no formato do contrato', async () => {
      const resposta = await consultarApi();

      expect(resposta.statusCode).toBe(200);

      const corpo = resposta.json() as {
        itens: Record<string, unknown>[];
        total: number;
      };
      expect(corpo.total).toBe(VISIVEIS.length);
      expect(corpo.itens).toHaveLength(VISIVEIS.length);
      expect(Object.keys(corpo.itens[0] ?? {})).toEqual([
        'ref',
        'slug',
        'titulo',
        'tipologia',
        'situacao',
        'pais',
        'cidade',
        'bairro',
        'preco',
        'capa',
      ]);
    });

    it('devolve preço como texto decimal e capa como a foto de menor ordem', async () => {
      const itens = itensDaApi(await consultarApi('?pais=BR&ordenar=preco_asc'));

      const apartamento = itens.find((item) => item.ref === 'BR-0101');
      expect(apartamento?.slug).toBe('br-0101');
      expect(apartamento?.preco).toEqual({ valor: '4850000.10', moeda: 'BRL' });
      expect(apartamento?.capa).toEqual({ url: '/media/um.webp', alt: 'Fachada do prédio' });

      const semPreco = itens.find((item) => item.ref === 'BR-0102');
      expect(semPreco?.preco).toEqual({ valor: '1000000.00', moeda: 'BRL' });
      // Sem foto, o card ainda precisa sair no ar, com a capa nula.
      expect(semPreco?.capa).toBeNull();

      const semValor = itensDaApi(await consultarApi('?pais=AE')).find(
        (item) => item.ref === 'AE-0302'
      );
      expect(semValor?.preco).toBeNull();
    });

    it('nunca lista rascunho nem arquivado', async () => {
      const resposta = await consultarApi();

      expect(refsDaApi(resposta)).not.toContain('BR-0103');
      expect(refsDaApi(resposta)).not.toContain('PA-0202');

      const pais = await consultarApi('?pais=PA');
      expect(refsDaApi(pais)).toEqual(['PA-0203', 'PA-0201']);
    });

    it('lista reservado e vendido com as situações no corpo', async () => {
      const resposta = await consultarApi();
      const itens = resposta.json().itens as { ref: string; situacao: string }[];

      expect(itens.find((item) => item.ref === 'PA-0201')?.situacao).toBe('reservado');
      expect(itens.find((item) => item.ref === 'AE-0301')?.situacao).toBe('vendido');
    });

    it('ordena por mais recentes, com desempate pela referência', async () => {
      expect(refsDaApi(await consultarApi('?ordenar=recentes'))).toEqual(NA_ORDEM_RECENTES);
      expect(refsDaApi(await consultarApi())).toEqual(NA_ORDEM_RECENTES);
    });

    it('ordena por preço e deixa preço ausente por último nos dois sentidos', async () => {
      expect(refsDaApi(await consultarApi('?ordenar=preco_asc'))).toEqual(NA_ORDEM_PRECO_ASC);
      expect(refsDaApi(await consultarApi('?ordenar=preco_desc'))).toEqual(NA_ORDEM_PRECO_DESC);
    });

    it('filtra por praça somando apenas os imóveis daquela praça', async () => {
      const resposta = await consultarApi('?pais=AE&ordenar=preco_desc');
      const corpo = resposta.json() as { itens: { pais: string }[]; total: number };

      expect(corpo.total).toBe(2);
      expect(corpo.itens.every((item) => item.pais === 'AE')).toBe(true);
    });

    it('trata parâmetro vazio como ausência', async () => {
      const resposta = await consultarApi('?pais=&ordenar=');

      expect(resposta.statusCode).toBe(200);
      expect(refsDaApi(resposta)).toEqual(NA_ORDEM_RECENTES);
    });

    it('responde 400 para valor fora da lista', async () => {
      const pais = await consultarApi('?pais=XX');
      const ordem = await consultarApi('?ordenar=preco_alto');

      expect(pais.statusCode).toBe(400);
      expect(pais.json()).toEqual({ erro: 'parametro_invalido' });
      expect(ordem.statusCode).toBe(400);
    });

    it('responde 400 quando o parâmetro vem repetido', async () => {
      const resposta = await consultarApi('?pais=BR&pais=PA');

      expect(resposta.statusCode).toBe(400);
    });
  });

  describe('Página GET /imoveis', () => {
    it('mostra o catálogo em cards ligados por âncora, sem JavaScript', async () => {
      const resposta = await pedirPagina('/imoveis');

      expect(resposta.statusCode).toBe(200);
      expect(resposta.headers['content-type']).toContain('text/html');

      const body = resposta.body;
      expect(body).toContain('Imóveis do portfólio');
      expect(body).toContain('<a class="cartao" href="/imoveis/br-0101"');
      expect(body).toContain('R$ 4.850.000,10');
      expect(body).toContain('São Paulo, Jardins');
      expect(body).toContain('Fachada do prédio');
      expect(body).not.toContain('onclick');
      expect(refsDaPagina(body)).toEqual(NA_ORDEM_RECENTES);
    });

    it('dá selo para reservado e vendido e deixa publicado sem selo', async () => {
      const body = (await pedirPagina('/imoveis')).body;

      expect(body).toContain('<p class="selo">Reservado</p>');
      expect(body).toContain('<p class="selo">Vendido</p>');
      expect(body.match(/<p class="selo">/g)).toHaveLength(2);
    });

    it('aplica os dois filtros ao mesmo tempo', async () => {
      const resposta = await pedirPagina('/imoveis?pais=PA&ordenar=preco_desc');
      const api = await consultarApi('?pais=PA&ordenar=preco_desc');

      expect(refsDaPagina(resposta.body)).toEqual(refsDaApi(api));
      expect(refsDaPagina(resposta.body)).toEqual(['PA-0203', 'PA-0201']);
      expect(resposta.body).toContain('2 imóveis nesta seleção.');
    });

    it('preserva a seleção nos links de filtro, para recarregar igual', async () => {
      const body = (await pedirPagina('/imoveis?pais=PA&ordenar=preco_desc')).body;

      // & vira &amp; dentro do atributo, que é o escape correto do template.
      expect(body).toContain('href="/imoveis?pais=BR&amp;ordenar=preco_desc"');
      expect(body).toContain('href="/imoveis?pais=AE&amp;ordenar=preco_desc"');
      expect(body).toContain('href="/imoveis?pais=PA&amp;ordenar=preco_asc"');
      expect(body).toContain('href="/imoveis?ordenar=preco_desc"');
      // A opção escolhida não se repete como link.
      expect(body).toContain('<span class="ativa" aria-current="page">Panamá</span>');
      expect(body).toContain('<span class="ativa" aria-current="page">Maior preço</span>');
    });

    it('mostra o aviso do projeto e o rodapé editado no painel', async () => {
      const body = (await pedirPagina('/imoveis')).body;

      expect(body).toContain(AVISO);
      expect(body).toContain('<a href="/imoveis">Imóveis</a>');
    });

    it('avisa quando a seleção não tem imóvel', async () => {
      conectarBanco()
        .prepare("UPDATE imoveis SET situacao = 'arquivado' WHERE situacao <> 'rascunho'")
        .run();

      const body = (await pedirPagina('/imoveis?pais=BR')).body;

      expect(body).toContain('0 imóveis nesta seleção.');
      expect(body).toContain('Nenhum imóvel nesta seleção.');
      expect(body).toContain('href="/imoveis"');
    });

    it('volta para o catálogo inteiro quando a URL traz valor inválido', async () => {
      const resposta = await pedirPagina('/imoveis?pais=XX&ordenar=preco_desc');

      expect(resposta.statusCode).toBe(200);
      expect(refsDaPagina(resposta.body)).toEqual(NA_ORDEM_RECENTES);
    });

    it('escapa texto vindo do banco', async () => {
      semearImovel({
        ref: 'BR-0199',
        pais: 'BR',
        situacao: 'publicado',
        titulo: '<script>alert(1)</script>',
        preco: '1.00',
        fotos: [{ url: '/media/x.webp', alt: '"><img src=x onerror=alert(1)>', ordem: 0 }],
      });

      const body = (await pedirPagina('/imoveis?pais=BR')).body;

      expect(body).not.toContain('<script>alert(1)</script>');
      expect(body).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
      expect(body).not.toContain('onerror=alert(1)>');
      expect(body).not.toContain('<img src=x');
    });

    it('mostra imóvel publicado sem foto', async () => {
      const body = (await pedirPagina('/imoveis?pais=BR')).body;

      expect(body).toContain('Casa sem foto no ar');
      expect(body).toContain('<span class="sem-foto">Sem foto no ar</span>');
    });
  });

  describe('Início com destaques', () => {
    it('lista até três destaques e leva ao catálogo', async () => {
      const body = (await pedirPagina('/')).body;

      expect(body).toContain('Em destaque');
      expect(refsDaPagina(body)).toEqual(NA_ORDEM_RECENTES.slice(0, 3));
      expect(body).toContain('href="/imoveis"');
      expect(body).not.toContain('/imoveis/br-0103');
    });

    it('liga cada praça ao catálogo já filtrado', async () => {
      const body = (await pedirPagina('/')).body;

      expect(body).toContain('href="/imoveis?pais=BR"');
      expect(body).toContain('href="/imoveis?pais=PA"');
      expect(body).toContain('href="/imoveis?pais=AE"');
    });
  });

  describe('Endereço que não existe', () => {
    it('responde 404 com página amigável', async () => {
      const resposta = await pedirPagina('/endereco-invalido');

      expect(resposta.statusCode).toBe(404);
      expect(resposta.headers['content-type']).toContain('text/html');
      expect(resposta.body).toContain('Endereço não encontrado');
      expect(resposta.body).toContain('href="/imoveis"');
      expect(resposta.body).toContain(AVISO);
    });

    it('responde 404 em JSON para rota de API inexistente', async () => {
      const resposta = await app.inject({ method: 'GET', url: '/api/v1/inexistente' });

      expect(resposta.statusCode).toBe(404);
      expect(resposta.json()).toEqual({ erro: 'rota_nao_encontrada' });
    });
  });
});
