import { randomUUID } from 'node:crypto';
import { readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { FastifyInstance } from 'fastify';

const bancoTemporario = join(tmpdir(), `teste-checklist-visual-${randomUUID()}.sqlite`);

process.env.DB_PATH = bancoTemporario;
process.env.NODE_ENV = 'test';
process.env.COOKIE_SECURE = 'false';
process.env.SESSAO_TTL_SEGUNDOS = '3600';
process.env.SEGREDO_APP = 'segredo-de-teste-com-mais-de-trinta-bits-ok';
process.env.WHATSAPP_E164 = '+5511999999999';

const { buildApp } = await import('../src/app.js');
const { conectarBanco, fecharBanco } = await import('../src/infra/db.js');
const { executarMigracoes } = await import('../scripts/migrar.js');

const AVISO = 'Projeto de avaliação técnica. Imóveis, valores e contatos fictícios.';
const TOKENS = readFileSync(join('public', 'css', 'tokens.css'), 'utf8');
const ESTILOS = readFileSync(join('public', 'css', 'estilos.css'), 'utf8');

// Fora do bloco :root nenhum valor de cor, fonte ou espaço pode aparecer solto.
function corpoDoCss(css: string): string {
  return css.replace(/:root\s*\{[\s\S]*?\}/, '');
}

const PROPRIEDADES_TOKENIZADAS = [
  'color',
  'background',
  'background-color',
  'border-color',
  'border',
  'border-top',
  'outline',
  'font-family',
  'font-size',
  'font-weight',
  'line-height',
  'letter-spacing',
  'margin',
  'padding',
  'gap',
];

const PAGINAS = ['/', '/imoveis', '/imoveis/br-0101', '/endereco-que-nao-existe'];

describe('Conformidade com o checklist visual', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    executarMigracoes();

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
        'BR-0101',
        'br-0101',
        'Apartamento Alameda Lorena',
        'apartamento',
        'BR',
        'São Paulo',
        'Jardins',
        'Descrição do imóvel.',
        '4850000.10',
        'BRL',
        '212.00',
        null,
        null,
        3,
        2,
        1,
        14,
        'Parceiro Local',
        'publicado',
        agora,
        agora
      );

    for (const [ordem, alt] of ['Fachada do prédio', 'Sala integrada'].entries()) {
      conectarBanco()
        .prepare('INSERT INTO imagens (id, imovel_id, url, alt, ordem, criado_em) VALUES (?, ?, ?, ?, ?, ?)')
        .run(randomUUID(), id, `/media/capa-${ordem}.webp`, alt, ordem, agora);
    }

    // Os textos institucionais vêm do seed na instalação real; sem eles a Início não tem título.
    const insertTexto = conectarBanco().prepare(
      'INSERT OR REPLACE INTO textos_site (chave, conteudo_json, atualizado_em) VALUES (?, ?, ?)'
    );
    insertTexto.run(
      'inicio',
      JSON.stringify({
        titulo: 'Patrimônio não se compra, se constrói sob tese.',
        descricao: 'Imóveis com tese. Nas praças que fazem sentido para o seu patrimônio.',
      }),
      agora
    );
    insertTexto.run('rodape', JSON.stringify({ texto: 'Imóveis com tese, nas praças que fazem sentido.' }), agora);

    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    fecharBanco();
    rmSync(bancoTemporario, { force: true });
  });

  function pedir(url: string) {
    return app.inject({ method: 'GET', url });
  }

  describe('Arquivos de estilo servidos', () => {
    it('entrega os tokens do Anexo B e a folha de estilos do site', async () => {
      const tokens = await pedir('/css/tokens.css');
      const estilos = await pedir('/css/estilos.css');

      expect(tokens.statusCode).toBe(200);
      expect(tokens.headers['content-type']).toContain('text/css');
      expect(tokens.body).toContain('--c-night-brass');

      expect(estilos.statusCode).toBe(200);
      expect(estilos.headers['content-type']).toContain('text/css');
      expect(estilos.body).toContain('.grade-cartoes');
      expect(String(estilos.headers['set-cookie'] ?? '')).toBe('');
    });

    it('recusa nome de arquivo que não é uma folha .css simples', async () => {
      for (const url of [
        '/css/env',
        '/css/estilos.css.txt',
        '/css/%2e%2e%2f.env',
        '/css/..%2f..%2fpackage.json',
        '/css/',
      ]) {
        const resposta = await pedir(url);
        expect(resposta.statusCode).toBe(404);
        expect(resposta.body).toBe('estilo_nao_encontrado');
      }
    });
  });

  describe('Item 1 · tokens em todo lugar', () => {
    it('usa as variáveis do Anexo B nas páginas', () => {
      for (const propriedade of ['--c-primary', '--font-text', '--sp-4', '--fs-body', '--lh-body']) {
        expect(TOKENS).toContain(propriedade);
        expect(ESTILOS).toContain(`var(${propriedade})`);
      }
    });

    it('não repete cor, fonte ou espaço fora das variáveis', () => {
      const corpo = corpoDoCss(ESTILOS);

      expect(corpo).not.toMatch(/#[0-9a-fA-F]{3,8}/);

      const declaracoes = [...corpo.matchAll(/([a-z-]+)\s*:\s*([^;{}]+)[;]/g)].map((bate) => ({
        propriedade: bate[1] ?? '',
        valor: (bate[2] ?? '').trim(),
      }));
      expect(declaracoes.length).toBeGreaterThan(40);

      for (const { propriedade, valor } of declaracoes) {
        if (!PROPRIEDADES_TOKENIZADAS.includes(propriedade)) continue;
        // Zerar margem e herdar cor não são valores de design.
        if (/^(0|auto)(\s+(0|auto))*$/.test(valor)) continue;
        if (['none', 'inherit', 'transparent'].includes(valor)) continue;

        expect(`${propriedade}: ${valor}`).toContain('var(--');
      }
    });
  });

  describe('Item 4 e 2 · contraste, foco e landmarks', () => {
    it('desenha o anel de foco com o latão do Anexo B', () => {
      expect(ESTILOS).toMatch(/:focus-visible\s*\{[^}]*outline:[^;]*var\(--c-night-brass\)/);
    });

    it('pinta o texto do preço com o latão legível, nunca o decorativo', () => {
      expect(ESTILOS).toContain('color: var(--c-brass-text)');
      expect(ESTILOS).not.toMatch(/color:\s*var\(--c-brass\)/);
    });

    it('nomeia cada ponto de navegação e mantem um só nível de página', async () => {
      for (const url of PAGINAS) {
        const body = (await pedir(url)).body;

        expect(body).toContain('<html lang="pt-BR">');
        expect(body.match(/<h1/g)).toHaveLength(1);
        expect(body.match(/<main/g)).toHaveLength(1);
        expect(body.match(/<footer/g)).toHaveLength(1);

        for (const nav of body.match(/<nav[^>]*>/g) ?? []) {
          expect(nav).toContain('aria-label');
        }
      }
    });

    it('descreve toda imagem e todo link tem destino', async () => {
      for (const url of PAGINAS) {
        const body = (await pedir(url)).body;

        for (const imagem of body.match(/<img[^>]*>/g) ?? []) {
          expect(imagem).toMatch(/alt="[^"]+"/);
        }
      }
    });
  });

  describe('Item 5 e 6 · animações e conteúdo sem JavaScript', () => {
    it('anima só com transform e opacity', () => {
      const quadro = /@keyframes[\s\S]*?\n\}/.exec(ESTILOS)?.[0] ?? '';

      expect(quadro).toContain('@keyframes');
      expect(quadro).toMatch(/opacity:/);
      expect(quadro).toMatch(/transform: translateY/);
      expect(quadro).not.toMatch(/(width|height|margin|padding|top|left|background|color):/);
      expect(ESTILOS).toMatch(/transition:\s*transform[^;]*,\s*opacity/);
    });

    it('para tudo com reduzir movimento', () => {
      const bloco = /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*\n\}/.exec(ESTILOS)?.[0] ?? '';

      expect(bloco).toContain('animation: none !important');
      expect(bloco).toContain('transition: none !important');
      expect(bloco).toContain('transform: none');
    });

    it('não depende de script para mostrar o conteúdo', async () => {
      for (const url of PAGINAS) {
        const body = (await pedir(url)).body;

        expect(body).not.toMatch(/<script/i);
        expect(body).not.toContain('onclick');
        expect(body).not.toMatch(/\sstyle="/);
        expect(body).toContain('<link rel="stylesheet" href="/css/tokens.css" />');
        expect(body).toContain('<link rel="stylesheet" href="/css/estilos.css" />');
      }
    });
  });

  describe('Item 7, 8 e 9 · largura, texto proibido e aviso', () => {
    it('não trava a largura em nada que a grade resolve', () => {
      expect(ESTILOS).toContain('flex-wrap: wrap');
      expect(ESTILOS).toContain('max-width: 100%');
      expect(ESTILOS).toContain('min-width: 0');
      expect(ESTILOS).not.toMatch(/white-space:\s*nowrap/);
      expect(ESTILOS).not.toMatch(/position:\s*(fixed|sticky)/);
    });

    it('não tem emoji, travessão nem texto de preenchimento', async () => {
      for (const url of PAGINAS) {
        const body = (await pedir(url)).body;

        expect(body).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u);
        expect(body).not.toContain('\u2014');
        expect(body).not.toMatch(/lorem ipsum/i);
        expect(body).not.toContain('Card title');
      }
    });

    it('fecha toda página pública com o aviso literal', async () => {
      for (const url of PAGINAS) {
        const body = (await pedir(url)).body;
        expect(body).toContain(`<p class="aviso">${AVISO}</p>`);
      }
    });
  });
});
