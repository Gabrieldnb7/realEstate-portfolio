import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { FastifyInstance } from 'fastify';

const bancoTemporario = join(tmpdir(), `teste-ficha-${randomUUID()}.sqlite`);
const NUMERO = '+5511999999999';

process.env.DB_PATH = bancoTemporario;
process.env.NODE_ENV = 'test';
process.env.COOKIE_SECURE = 'false';
process.env.SESSAO_TTL_SEGUNDOS = '3600';
process.env.SEGREDO_APP = 'segredo-de-teste-com-mais-de-trinta-bits-ok';
process.env.WHATSAPP_E164 = NUMERO;

const { buildApp } = await import('../src/app.js');
const { conectarBanco, fecharBanco } = await import('../src/infra/db.js');
const { executarMigracoes } = await import('../scripts/migrar.js');
const { MOEDA_POR_PRACA } = await import('../src/entities/index.js');

const AVISO = 'Projeto de avaliação técnica. Imóveis, valores e contatos fictícios.';
const CHAVE_ESPERADA = [
  'ref',
  'slug',
  'titulo',
  'tipologia',
  'situacao',
  'pais',
  'cidade',
  'bairro',
  'descricao',
  'preco',
  'areaPrivativa',
  'areaConstruida',
  'areaTerreno',
  'quartos',
  'banheiros',
  'vagas',
  'andar',
  'precoPorM2',
  'imagens',
  'whatsappUrl',
];

interface Semente {
  ref: string;
  pais: 'BR' | 'PA' | 'AE';
  tipologia: 'apartamento' | 'penthouse' | 'villa' | 'estate';
  situacao: string;
  titulo: string;
  cidade: string;
  bairro: string;
  descricao?: string;
  preco?: string | null;
  areaPrivativa?: string | null;
  areaConstruida?: string | null;
  areaTerreno?: string | null;
  quartos?: number;
  banheiros?: number | null;
  vagas?: number | null;
  andar?: number | null;
  fotos?: { url: string; alt: string; ordem: number }[];
}

const CATALOGO: Semente[] = [
  {
    ref: 'BR-0101',
    pais: 'BR',
    tipologia: 'apartamento',
    situacao: 'publicado',
    titulo: 'Apartamento Alameda Lorena',
    cidade: 'São Paulo',
    bairro: 'Jardins',
    descricao: 'Planta de 212 m² nos Jardins, a duas quadras do park.',
    preco: '4850000.10',
    areaPrivativa: '212.00',
    areaConstruida: null,
    areaTerreno: null,
    quartos: 3,
    banheiros: 3,
    vagas: 2,
    andar: 14,
    fotos: [
      { url: '/media/capa.jpg', alt: 'Fachada do prédio', ordem: 0 },
      { url: '/media/sala.jpg', alt: 'Sala integrada', ordem: 1 },
    ],
  },
  {
    ref: 'BR-0102',
    pais: 'BR',
    tipologia: 'penthouse',
    situacao: 'publicado',
    titulo: 'Penthouse Vista Mar',
    cidade: 'Rio de Janeiro',
    bairro: 'Botafogo',
    preco: '9000000.00',
    areaPrivativa: '300.00',
    quartos: 4,
    banheiros: null,
    vagas: null,
    andar: 22,
    fotos: [{ url: '/media/penthouse.jpg', alt: 'Terraço', ordem: 0 }],
  },
  {
    ref: 'PA-0201',
    pais: 'PA',
    tipologia: 'villa',
    situacao: 'publicado',
    titulo: 'Villa Coronado',
    cidade: 'Coronado',
    bairro: 'Praia',
    preco: '1250000.00',
    areaPrivativa: null,
    areaConstruida: '250.00',
    areaTerreno: '400.00',
    quartos: 4,
    banheiros: 5,
    vagas: 3,
    andar: null,
    fotos: [{ url: '/media/villa.webp', alt: 'Beira-mar', ordem: 0 }],
  },
  {
    ref: 'AE-0301',
    pais: 'AE',
    tipologia: 'estate',
    situacao: 'vendido',
    titulo: 'Estate Palm Hills',
    cidade: 'Dubai',
    bairro: 'Palm Jumeirah',
    preco: '48000000.00',
    areaConstruida: '500.00',
    areaTerreno: '1200.00',
    quartos: 6,
    banheiros: 7,
    vagas: 6,
    fotos: [{ url: '/media/estate.jpg', alt: 'Jardim frontal', ordem: 0 }],
  },
  {
    ref: 'PA-0203',
    pais: 'PA',
    tipologia: 'apartamento',
    situacao: 'reservado',
    titulo: 'Apartamento Costa del Este',
    cidade: 'Cidade do Panamá',
    bairro: 'Costa del Este',
    preco: '1890000.00',
    areaPrivativa: '140.00',
    quartos: 2,
    banheiros: 2,
    vagas: 1,
    andar: 8,
    fotos: [{ url: '/media/pa.jpg', alt: 'Piscina', ordem: 0 }],
  },
  {
    ref: 'BR-0105',
    pais: 'BR',
    tipologia: 'apartamento',
    situacao: 'publicado',
    titulo: 'Estúdio sem preço definido',
    cidade: 'Porto Feliz',
    bairro: 'Centro',
    preco: null,
    areaPrivativa: '100.00',
    quartos: 1,
    andar: 2,
    fotos: [{ url: '/media/estudio.jpg', alt: 'Ambiente único', ordem: 0 }],
  },
  {
    ref: 'BR-0199',
    pais: 'BR',
    tipologia: 'apartamento',
    situacao: 'rascunho',
    titulo: 'Apartamento em rascunho',
    cidade: 'São Paulo',
    bairro: 'Pinheiros',
    preco: '2000000.00',
    areaPrivativa: '90.00',
    quartos: 2,
    andar: 5,
  },
  {
    ref: 'PA-0299',
    pais: 'PA',
    tipologia: 'villa',
    situacao: 'arquivado',
    titulo: 'Villa arquivada',
    cidade: 'Cerro Azul',
    bairro: 'Montanha',
    preco: '700000.00',
    areaConstruida: '180.00',
    areaTerreno: '300.00',
    quartos: 3,
  },
];

describe('Página de detalhe do imóvel e CTA de WhatsApp', () => {
  let app: FastifyInstance;

  function semearImovel(semente: Semente): void {
    const id = randomUUID();
    const agora = new Date().toISOString();

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
        semente.titulo,
        semente.tipologia,
        semente.pais,
        semente.cidade,
        semente.bairro,
        semente.descricao ?? 'Descrição do imóvel.',
        semente.preco ?? null,
        semente.preco ? MOEDA_POR_PRACA[semente.pais] : null,
        semente.areaPrivativa ?? null,
        semente.areaConstruida ?? null,
        semente.areaTerreno ?? null,
        semente.quartos ?? 2,
        semente.banheiros ?? null,
        semente.vagas ?? null,
        semente.andar ?? null,
        'Parceiro Local',
        semente.situacao,
        agora,
        agora
      );

    for (const foto of semente.fotos ?? []) {
      conectarBanco()
        .prepare(
          'INSERT INTO imagens (id, imovel_id, url, alt, ordem, criado_em) VALUES (?, ?, ?, ?, ?, ?)'
        )
        .run(randomUUID(), id, foto.url, foto.alt, foto.ordem, agora);
    }
  }

  function fichaDaApi(slug: string) {
    return app.inject({ method: 'GET', url: `/api/v1/imoveis/${slug}` });
  }

  function pagina(slug: string) {
    return app.inject({ method: 'GET', url: `/imoveis/${slug}` });
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

  describe('API GET /api/v1/imoveis/:slug', () => {
    it('devolve a ficha no formato do contrato, sem o parceiro interno', async () => {
      const resposta = await fichaDaApi('br-0101');

      expect(resposta.statusCode).toBe(200);
      const corpo = resposta.json() as Record<string, unknown>;
      expect(Object.keys(corpo)).toEqual(CHAVE_ESPERADA);
      expect(corpo.tipologia).toBe('apartamento');
      expect(corpo.situacao).toBe('publicado');
      expect(corpo.preco).toEqual({ valor: '4850000.10', moeda: 'BRL' });
      expect(corpo.imagens).toEqual([
        { url: '/media/capa.jpg', alt: 'Fachada do prédio' },
        { url: '/media/sala.jpg', alt: 'Sala integrada' },
      ]);
    });

    it('calcula o preço por m² sobre a área privativa de apartamento e penthouse', async () => {
      const apartamento = (await fichaDaApi('br-0101')).json() as {
        precoPorM2: { valor: string; moeda: string };
      };
      expect(apartamento.precoPorM2).toEqual({ valor: '22877.36', moeda: 'BRL' });

      const penthouse = (await fichaDaApi('br-0102')).json() as { precoPorM2: { valor: string } };
      expect(penthouse.precoPorM2.valor).toBe('30000.00');
    });

    it('calcula o preço por m² sobre a área construída de villa e estate', async () => {
      const villa = (await fichaDaApi('pa-0201')).json() as {
        precoPorM2: { valor: string; moeda: string };
        areaPrivativa: string | null;
      };
      expect(villa.precoPorM2).toEqual({ valor: '5000.00', moeda: 'USD' });
      expect(villa.areaPrivativa).toBeNull();

      const estate = (await fichaDaApi('ae-0301')).json() as { precoPorM2: { valor: string } };
      expect(estate.precoPorM2.valor).toBe('96000.00');
    });

    it('manda para null o que a tipologia não usa e o que não foi preenchido', async () => {
      const villa = (await fichaDaApi('pa-0201')).json() as Record<string, unknown>;
      expect(villa.andar).toBeNull();
      expect(villa.areaPrivativa).toBeNull();
      expect(villa.areaTerreno).toBe('400.00');

      const penthouse = (await fichaDaApi('br-0102')).json() as Record<string, unknown>;
      expect(penthouse.banheiros).toBeNull();
      expect(penthouse.vagas).toBeNull();
      expect(penthouse.areaConstruida).toBeNull();
    });

    it('monta o link do WhatsApp com a mensagem que traz a referência', async () => {
      const corpo = (await fichaDaApi('br-0101')).json() as { whatsappUrl: string };

      expect(corpo.whatsappUrl).not.toBeNull();
      expect(corpo.whatsappUrl.startsWith(`https://wa.me/5511999999999?`)).toBe(true);

      const url = new URL(corpo.whatsappUrl);
      expect(url.searchParams.get('text')).toBe('Olá, tenho interesse no imóvel BR-0101');
    });

    it('não mostra o botão para imóvel vendido, que continua na lista com selo', async () => {
      const corpo = (await fichaDaApi('ae-0301')).json() as {
        situacao: string;
        whatsappUrl: string | null;
      };

      expect(corpo.situacao).toBe('vendido');
      expect(corpo.whatsappUrl).toBeNull();
    });

    it('mantém o botão para reservado', async () => {
      const corpo = (await fichaDaApi('pa-0203')).json() as { whatsappUrl: string | null };

      expect(corpo.whatsappUrl).toContain('im%C3%B3vel+PA-0203');
    });

    it('devolve preço por m² nulo quando não há preço ou área', async () => {
      const corpo = (await fichaDaApi('br-0105')).json() as {
        preco: unknown;
        precoPorM2: unknown;
        whatsappUrl: string | null;
      };

      expect(corpo.preco).toBeNull();
      expect(corpo.precoPorM2).toBeNull();
      expect(corpo.whatsappUrl).not.toBeNull();
    });

    it('responde 404 para rascunho, arquivado e slug que não existe', async () => {
      const rascunho = await fichaDaApi('br-0199');
      const arquivado = await fichaDaApi('pa-0299');
      const inexistente = await fichaDaApi('nao-existe');

      expect(rascunho.statusCode).toBe(404);
      expect(rascunho.json()).toEqual({ erro: 'imovel_nao_encontrado' });
      expect(arquivado.statusCode).toBe(404);
      expect(inexistente.statusCode).toBe(404);
    });

    it('responde 404 sem sessão e sem exigir cookie', async () => {
      const resposta = await fichaDaApi('br-0101');

      expect(resposta.statusCode).toBe(200);
      expect(String(resposta.headers['set-cookie'] ?? '')).toBe('');
    });
  });

  describe('Página GET /imoveis/:slug', () => {
    it('traz referência, preço, preço por m² e a ficha da tipologia', async () => {
      const resposta = await pagina('br-0101');

      expect(resposta.statusCode).toBe(200);
      expect(resposta.headers['content-type']).toContain('text/html');

      const body = resposta.body;
      expect(body).toContain('Referência BR-0101');
      expect(body).toContain('<h1>Apartamento Alameda Lorena</h1>');
      expect(body).toContain('São Paulo, Jardins');
      expect(body).toContain('R$ 4.850.000,10');
      expect(body).toContain('R$ 22.877,36 por m², calculado sobre 212,00 m² de área.');
      expect(body).toContain('<dt>Quartos</dt>');
      expect(body).toContain('<dt>Andar</dt>');
      expect(body).toContain('<dd>14</dd>');
      expect(body).toContain('<dt>Área privativa</dt>');
      expect(body).toContain('<dd>212,00 m²</dd>');
      expect(body).toContain('Planta de 212 m²');
      expect(body).toContain(AVISO);
    });

    it('omite campo que não se aplica à tipologia', async () => {
      const villa = (await pagina('pa-0201')).body;

      expect(villa).toContain('<dt>Área construída</dt>');
      expect(villa).toContain('<dt>Área do terreno</dt>');
      expect(villa).toContain('<dd>400,00 m²</dd>');
      expect(villa).not.toContain('<dt>Área privativa</dt>');
      expect(villa).not.toContain('<dt>Andar</dt>');

      // Banheiros e vagas opcionais só aparecem quando preenchidos.
      const penthouse = (await pagina('br-0102')).body;
      expect(penthouse).not.toContain('<dt>Banheiros</dt>');
      expect(penthouse).not.toContain('<dt>Vagas</dt>');
    });

    it('mostra a galeria com a descrição de cada foto', async () => {
      const body = (await pagina('br-0101')).body;

      expect(body).toContain('src="/media/capa.jpg"');
      expect(body).toContain('alt="Fachada do prédio"');
      expect(body).toContain('<figcaption>Sala integrada</figcaption>');
    });

    it('liga o botão do WhatsApp como âncora real, sem JavaScript', async () => {
      const body = (await pagina('br-0101')).body;

      expect(body).toContain('<a class="botao" href="https://wa.me/5511999999999?text=');
      expect(body).toContain('im%C3%B3vel+BR-0101');
      expect(body).not.toContain('onclick');
      expect(body).toContain('<a href="/imoveis">Voltar para o catálogo</a>');
    });

    it('esconde o botão e mostra o selo quando o imóvel está vendido', async () => {
      const body = (await pagina('ae-0301')).body;

      expect(body).not.toContain('wa.me');
      expect(body).not.toContain('class="botao"');
      expect(body).toContain('<p class="selo">Vendido</p>');
    });

    it('diz que o preço vem sob consulta quando não há preço', async () => {
      const body = (await pagina('br-0105')).body;

      expect(body).toContain('Preço sob consulta');
      expect(body).not.toContain('por m², calculado sobre');
    });

    it('responde 404 amigável para rascunho, arquivado e slug inexistente', async () => {
      const rascunho = await pagina('br-0199');
      const inexistente = await pagina('slug-que-nao-existe');

      expect(rascunho.statusCode).toBe(404);
      expect(rascunho.body).toContain('Endereço não encontrado');
      expect(rascunho.body).toContain(AVISO);
      expect(inexistente.statusCode).toBe(404);
      expect(inexistente.body).not.toContain('Apartamento em rascunho');
    });

    it('escapa texto vindo do banco', async () => {
      semearImovel({
        ref: 'BR-0198',
        pais: 'BR',
        tipologia: 'apartamento',
        situacao: 'publicado',
        titulo: '<script>alert(1)</script>',
        cidade: 'São Paulo',
        bairro: 'Jardins',
        descricao: '"><img src=x onerror=alert(1)>',
        preco: '1000.00',
        areaPrivativa: '10.00',
        andar: 1,
        fotos: [{ url: '/media/x.jpg', alt: '<b>negrito</b>', ordem: 0 }],
      });

      const body = (await pagina('br-0198')).body;

      expect(body).not.toContain('<script>alert(1)</script>');
      expect(body).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
      expect(body).not.toContain('<img src=x');
      expect(body).not.toContain('<b>negrito</b>');
    });

    it('abre pelo link que o catálogo entrega', async () => {
      const catalogo = await app.inject({ method: 'GET', url: '/imoveis?pais=BR' });
      const slug = /<a class="cartao" href="\/imoveis\/([a-z0-9-]+)"/.exec(catalogo.body)?.[1];

      expect(slug).toBeTruthy();
      const ficha = await pagina(slug ?? '');
      expect(ficha.statusCode).toBe(200);
    });
  });

  describe('Sem WHATSAPP_E164 injetado', () => {
    it('não monta botão quando o número não chega do ambiente', async () => {
      delete process.env.WHATSAPP_E164;
      const semNumero = await buildApp();
      await semNumero.ready();

      try {
        const corpo = (await semNumero.inject({ method: 'GET', url: '/api/v1/imoveis/br-0101' })).json() as {
          whatsappUrl: string | null;
        };
        expect(corpo.whatsappUrl).toBeNull();

        const paginaSemNumero = await semNumero.inject({ method: 'GET', url: '/imoveis/br-0101' });
        expect(paginaSemNumero.body).not.toContain('wa.me');
      } finally {
        await semNumero.close();
        process.env.WHATSAPP_E164 = NUMERO;
      }
    });
  });
});
