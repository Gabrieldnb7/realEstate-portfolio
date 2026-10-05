import { randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { FastifyInstance } from 'fastify';

const bancoTemporario = join(tmpdir(), `teste-fotos-${randomUUID()}.sqlite`);
const pastaUploads = mkdtempSync(join(tmpdir(), 'teste-fotos-uploads-'));

process.env.DB_PATH = bancoTemporario;
process.env.UPLOAD_DIR = pastaUploads;
process.env.NODE_ENV = 'test';
process.env.COOKIE_SECURE = 'false';
process.env.SESSAO_TTL_SEGUNDOS = '3600';
process.env.SEGREDO_APP = 'segredo-de-teste-com-mais-de-trinta-bits-ok';

const { buildApp } = await import('../src/app.js');
const { conectarBanco, fecharBanco } = await import('../src/infra/db.js');
const { executarMigracoes } = await import('../scripts/migrar.js');
const { criarHashSenha } = await import('../src/repositories/seguranca/senhas.js');
const { buscarRegistro } = await import('../src/repositories/imoveis/imovel.repositorio.js');

const EMAIL_ADMIN = 'admin@exemplo.com';
const SENHA_ADMIN = 'senhaSegura123';
const LIMITE_BYTES = 5 * 1024 * 1024;

// Bytes de abertura reais: é a assinatura que o servidor confere, não o nome do arquivo.
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('corpo-da-foto', 'utf8')]);
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('corpo-da-foto', 'utf8'),
]);
const WEBP = Buffer.concat([
  Buffer.from('RIFF', 'latin1'),
  Buffer.from([10, 0, 0, 0]),
  Buffer.from('WEBPVP8 ', 'latin1'),
]);

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

interface PartesDoFormulario {
  campos?: Record<string, string>;
  arquivo?: { nome: string; conteudo: Buffer; tipo?: string };
}

function corpoMultipart({ campos = {}, arquivo }: PartesDoFormulario): {
  payload: Buffer;
  limite: string;
} {
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

  if (arquivo) {
    pedacos.push(
      Buffer.from(
        `--${limite}\r\nContent-Disposition: form-data; name="arquivo"; filename="${arquivo.nome}"\r\n` +
          `Content-Type: ${arquivo.tipo ?? 'image/jpeg'}\r\n\r\n`,
        'utf8'
      ),
      arquivo.conteudo,
      Buffer.from('\r\n', 'utf8')
    );
  }

  pedacos.push(Buffer.from(`--${limite}--\r\n`, 'utf8'));

  return { payload: Buffer.concat(pedacos), limite };
}

describe('Upload e gestão de fotos do imóvel', () => {
  let app: FastifyInstance;
  let cookie = '';
  let imovelId = '';

  function arquivosNaPasta(): string[] {
    return readdirSync(pastaUploads);
  }

  function enviarFoto(
    formulario: PartesDoFormulario,
    destino = `/api/v1/admin/imoveis/${imovelId}/imagens`,
    cookieSessao = cookie
  ) {
    const { payload, limite } = corpoMultipart(formulario);

    return app.inject({
      method: 'POST',
      url: destino,
      headers: { cookie: cookieSessao, 'content-type': `multipart/form-data; boundary=${limite}` },
      payload,
    });
  }

  function fotoPelaUrl(url: string): { id: string; ordem: number } | undefined {
    return conectarBanco()
      .prepare('SELECT id, ordem FROM imagens WHERE url = ?')
      .get(url) as { id: string; ordem: number } | undefined;
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

  beforeEach(async () => {
    const db = conectarBanco();
    db.prepare('DELETE FROM imagens').run();
    db.prepare('DELETE FROM imoveis').run();

    for (const arquivo of arquivosNaPasta()) {
      rmSync(join(pastaUploads, arquivo), { force: true });
    }

    const criado = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/imoveis',
      headers: { cookie },
      payload: APARTAMENTO,
    });
    imovelId = String((criado.json() as { id: string }).id);
  });

  afterAll(async () => {
    await app.close();
    fecharBanco();
    for (const sufixo of ['', '-wal', '-shm']) {
      rmSync(`${bancoTemporario}${sufixo}`, { force: true });
    }
    rmSync(pastaUploads, { recursive: true, force: true });
  });

  describe('Upload pela API', () => {
    it('grava a foto com nome aleatório e devolve 201 com id e url', async () => {
      const resposta = await enviarFoto({
        campos: { alt: 'Sala com vista para o mar' },
        arquivo: { nome: 'IMG_9911.jpg', conteudo: JPEG },
      });

      expect(resposta.statusCode).toBe(201);
      const corpo = resposta.json() as { id: string; url: string };

      expect(corpo.url).toMatch(/^\/media\/[0-9a-f-]{36}\.jpg$/);
      expect(corpo.url).not.toContain('IMG_9911');
      expect(existsSync(join(pastaUploads, corpo.url.replace('/media/', '')))).toBe(true);
      expect(arquivosNaPasta()).toHaveLength(1);

      const registro = buscarRegistro(imovelId);
      expect(registro?.imagens[0]?.alt).toBe('Sala com vista para o mar');
      expect(registro?.imagens[0]?.ordem).toBe(0);
      expect(registro?.imagens[0]?.id).toBe(corpo.id);
    });

    it('aceita PNG e WebP com a extensão correspondente ao conteúdo', async () => {
      const png = await enviarFoto({
        campos: { alt: 'Fachada' },
        arquivo: { nome: 'fachada.png', conteudo: PNG, tipo: 'image/png' },
      });
      const webp = await enviarFoto({
        campos: { alt: 'Área de lazer' },
        arquivo: { nome: 'lazer.webp', conteudo: WEBP, tipo: 'image/webp' },
      });

      expect(png.statusCode).toBe(201);
      expect((png.json() as { url: string }).url).toMatch(/\.png$/);
      expect(webp.statusCode).toBe(201);
      expect((webp.json() as { url: string }).url).toMatch(/\.webp$/);
    });

    it('recusa acima de 5 MB com 413 e sem gravar arquivo', async () => {
      const resposta = await enviarFoto({
        campos: { alt: 'Planta ampla' },
        arquivo: {
          nome: 'planta.jpg',
          conteudo: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(LIMITE_BYTES + 1024, 0x41)]),
        },
      });

      expect(resposta.statusCode).toBe(413);
      expect((resposta.json() as { erro: string }).erro).toBe('arquivo_grande_demais');
      expect(arquivosNaPasta()).toHaveLength(0);
      expect(conectarBanco().prepare('SELECT COUNT(*) AS total FROM imagens').get()).toEqual({ total: 0 });
    });

    it('recusa conteúdo que não é imagem com 415 mesmo com extensão de foto', async () => {
      const resposta = await enviarFoto({
        campos: { alt: 'Notas da visita' },
        arquivo: { nome: 'notas.jpg', conteudo: Buffer.from('isto não é uma foto', 'utf8') },
      });

      expect(resposta.statusCode).toBe(415);
      expect((resposta.json() as { erro: string }).erro).toBe('formato_nao_aceito');
      expect(arquivosNaPasta()).toHaveLength(0);
    });

    it('recusa extensão que não bate com o conteúdo, e extensão de fora da lista', async () => {
      const disfarce = await enviarFoto({
        campos: { alt: 'Disfarce' },
        arquivo: { nome: 'disfarce.png', conteudo: JPEG },
      });
      const executavel = await enviarFoto({
        campos: { alt: 'Script' },
        arquivo: { nome: 'instalador.exe', conteudo: JPEG },
      });

      expect(disfarce.statusCode).toBe(415);
      expect(executavel.statusCode).toBe(415);
      expect(arquivosNaPasta()).toHaveLength(0);
    });

    it('recusa alt ausente ou vazio com 422 e sem deixar arquivo órfão', async () => {
      const semAlt = await enviarFoto({ arquivo: { nome: 'sem-alt.jpg', conteudo: JPEG } });
      const altVazio = await enviarFoto({
        campos: { alt: '   ' },
        arquivo: { nome: 'alt-vazio.jpg', conteudo: JPEG },
      });

      expect(semAlt.statusCode).toBe(422);
      expect(codigosDeCampo(semAlt)).toEqual(['alt:obrigatorio']);
      expect(altVazio.statusCode).toBe(422);
      expect(arquivosNaPasta()).toHaveLength(0);
    });

    it('recusa requisição sem a parte de arquivo com 400', async () => {
      const resposta = await enviarFoto({ campos: { alt: 'Só a descrição' } });

      expect(resposta.statusCode).toBe(400);
      expect((resposta.json() as { erro: string }).erro).toBe('requisicao_invalida');
    });

    it('recusa corpo que não é multipart com 400', async () => {
      const resposta = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/imoveis/${imovelId}/imagens`,
        headers: { cookie, 'content-type': 'application/json' },
        payload: { alt: 'Sala', arquivo: 'IMG.jpg' },
      });

      expect(resposta.statusCode).toBe(400);
    });

    it('segura o limite de 12 fotos por imóvel', async () => {
      for (let indice = 1; indice <= 12; indice++) {
        const resposta = await enviarFoto({
          campos: { alt: `Foto ${indice}` },
          arquivo: { nome: `foto-${indice}.jpg`, conteudo: JPEG },
        });
        expect(resposta.statusCode).toBe(201);
      }

      const decimaTerceira = await enviarFoto({
        campos: { alt: 'Foto 13' },
        arquivo: { nome: 'foto-13.jpg', conteudo: JPEG },
      });

      expect(decimaTerceira.statusCode).toBe(422);
      expect(codigosDeCampo(decimaTerceira)).toEqual(['imagens:limite_excedido']);
      expect(arquivosNaPasta()).toHaveLength(12);
    });

    it('exige sessão na rota de upload', async () => {
      const resposta = await enviarFoto(
        { campos: { alt: 'Sem sessão' }, arquivo: { nome: 'sem-sessao.jpg', conteudo: JPEG } },
        `/api/v1/admin/imoveis/${imovelId}/imagens`,
        ''
      );

      expect(resposta.statusCode).toBe(401);
      expect(arquivosNaPasta()).toHaveLength(0);
    });

    it('devolve 404 quando o imóvel não existe', async () => {
      const resposta = await enviarFoto(
        { campos: { alt: 'Foto' }, arquivo: { nome: 'foto.jpg', conteudo: JPEG } },
        '/api/v1/admin/imoveis/inexistente/imagens'
      );

      expect(resposta.statusCode).toBe(404);
      expect(arquivosNaPasta()).toHaveLength(0);
    });
  });

  describe('Remoção e capa', () => {
    async function enviar(alt: string, nome: string): Promise<string> {
      const resposta = await enviarFoto({
        campos: { alt },
        arquivo: { nome, conteudo: JPEG },
      });
      return (resposta.json() as { url: string }).url;
    }

    it('remove o registro do banco e o arquivo do disco com 204', async () => {
      const url = await enviar('Cozinha', 'cozinha.jpg');
      const imagem = fotoPelaUrl(url)!;

      const resposta = await app.inject({
        method: 'DELETE',
        url: `/api/v1/admin/imoveis/${imovelId}/imagens/${imagem.id}`,
        headers: { cookie },
      });

      expect(resposta.statusCode).toBe(204);
      expect(fotoPelaUrl(url)).toBeUndefined();
      expect(existsSync(join(pastaUploads, url.replace('/media/', '')))).toBe(false);
    });

    it('a primeira foto é a capa e a seguinte assume a capa quando ela sai', async () => {
      const capa = await enviar('Entrada', 'entrada.jpg');
      const segunda = await enviar('Quarto', 'quarto.jpg');

      expect(buscarRegistro(imovelId)?.imagens[0]?.url).toBe(capa);

      const idDaCapa = fotoPelaUrl(capa)!.id;
      await app.inject({
        method: 'DELETE',
        url: `/api/v1/admin/imoveis/${imovelId}/imagens/${idDaCapa}`,
        headers: { cookie },
      });

      const restante = buscarRegistro(imovelId);
      expect(restante?.imagens).toHaveLength(1);
      expect(restante?.imagens[0]?.url).toBe(segunda);
      expect(restante?.imagens[0]?.ordem).toBe(0);
    });

    it('reindexa a ordem das restantes ao remover do meio', async () => {
      await enviar('Uma', 'uma.jpg');
      await enviar('Duas', 'duas.jpg');
      const terceira = await enviar('Tres', 'tres.jpg');

      const doMeio = buscarRegistro(imovelId)!.imagens[1];
      await app.inject({
        method: 'DELETE',
        url: `/api/v1/admin/imoveis/${imovelId}/imagens/${doMeio.id}`,
        headers: { cookie },
      });

      const imagens = buscarRegistro(imovelId)!.imagens;
      expect(imagens.map((imagem) => imagem.ordem)).toEqual([0, 1]);
      expect(imagens[1]?.url).toBe(terceira);
    });

    it('devolve 404 ao remover foto que não é daquele imóvel', async () => {
      const url = await enviar('Sala', 'sala.jpg');
      const imagem = fotoPelaUrl(url)!;

      const outro = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/imoveis',
        headers: { cookie },
        payload: { ...APARTAMENTO, ref: 'BR-1002', titulo: 'Outro apartamento' },
      });
      const idOutro = (outro.json() as { id: string }).id;

      const resposta = await app.inject({
        method: 'DELETE',
        url: `/api/v1/admin/imoveis/${idOutro}/imagens/${imagem.id}`,
        headers: { cookie },
      });

      expect(resposta.statusCode).toBe(404);
      expect(fotoPelaUrl(url)).toBeDefined();
    });

    it('exige sessão na rota de remoção', async () => {
      const url = await enviar('Banheiro', 'banheiro.jpg');
      const imagem = fotoPelaUrl(url)!;

      const resposta = await app.inject({
        method: 'DELETE',
        url: `/api/v1/admin/imoveis/${imovelId}/imagens/${imagem.id}`,
      });

      expect(resposta.statusCode).toBe(401);
      expect(fotoPelaUrl(url)).toBeDefined();
    });
  });

  describe('Rota pública de mídia', () => {
    it('entrega a imagem com Content-Type e sem precisar de sessão', async () => {
      const resposta = await enviarFoto({
        campos: { alt: 'Piscina' },
        arquivo: { nome: 'piscina.jpg', conteudo: JPEG },
      });
      const url = (resposta.json() as { url: string }).url;

      const leitura = await app.inject({ method: 'GET', url });

      expect(leitura.statusCode).toBe(200);
      expect(leitura.headers['content-type']).toBe('image/jpeg');
      expect(Buffer.compare(leitura.rawPayload, JPEG)).toBe(0);
    });

    it('devolve 404 para arquivo inexistente', async () => {
      const resposta = await app.inject({ method: 'GET', url: '/media/nao-existe.jpg' });

      expect(resposta.statusCode).toBe(404);
    });

    it('bloqueia tentativa de sair da pasta de uploads', async () => {
      for (const caminho of [
        '/media/..%2F..%2F.env',
        '/media/..%2F%2E%2E%2F.env',
        '/media/.env',
        '/media/..env',
      ]) {
        const resposta = await app.inject({ method: 'GET', url: caminho });
        expect(resposta.statusCode).toBe(404);
      }
    });

    it('não entrega arquivo cujo nome tem extensão de fora da lista', async () => {
      const caminho = join(pastaUploads, 'segredo.txt');
      writeFileSync(caminho, 'conteudo', 'utf8');

      const resposta = await app.inject({ method: 'GET', url: '/media/segredo.txt' });
      expect(resposta.statusCode).toBe(404);

      rmSync(caminho, { force: true });
    });
  });

  describe('Tela do painel', () => {
    it('envia foto pelo formulário sem JavaScript e volta para a edição com aviso', async () => {
      const { payload, limite } = corpoMultipart({
        campos: { alt: 'Varanda da sala' },
        arquivo: { nome: 'varanda.jpg', conteudo: JPEG },
      });

      const resposta = await app.inject({
        method: 'POST',
        url: `/admin/imoveis/${imovelId}/fotos`,
        headers: { cookie, 'content-type': `multipart/form-data; boundary=${limite}` },
        payload,
      });

      expect(resposta.statusCode).toBe(302);
      expect(resposta.headers.location).toBe(`/admin/imoveis/${imovelId}/editar?feito=foto`);

      const pagina = await app.inject({
        method: 'GET',
        url: resposta.headers.location!,
        headers: { cookie },
      });

      expect(pagina.body).toContain('Foto enviada.');
      expect(pagina.body).toContain('Varanda da sala');
      expect(pagina.body).toContain('>Capa<');
      expect(pagina.body).toContain('enctype="multipart/form-data"');
    });

    it('mostra o motivo quando o formato é recusado pelo formulário', async () => {
      const { payload, limite } = corpoMultipart({
        campos: { alt: 'Print' },
        arquivo: { nome: 'print.jpg', conteudo: Buffer.from('nem de longe uma imagem', 'utf8') },
      });

      const resposta = await app.inject({
        method: 'POST',
        url: `/admin/imoveis/${imovelId}/fotos`,
        headers: { cookie, 'content-type': `multipart/form-data; boundary=${limite}` },
        payload,
      });

      expect(resposta.statusCode).toBe(302);
      expect(resposta.headers.location).toContain('erro=formato');

      const pagina = await app.inject({
        method: 'GET',
        url: resposta.headers.location!,
        headers: { cookie },
      });

      expect(pagina.body).toContain('Formato não aceito');
      expect(arquivosNaPasta()).toHaveLength(0);
    });

    it('remove a foto pelo formulário e a lista volta sem ela', async () => {
      const envio = await enviarFoto({
        campos: { alt: 'Corredor' },
        arquivo: { nome: 'corredor.jpg', conteudo: JPEG },
      });
      const url = (envio.json() as { url: string }).url;
      const imagem = fotoPelaUrl(url)!;

      const resposta = await app.inject({
        method: 'POST',
        url: `/admin/imoveis/${imovelId}/fotos/remover`,
        headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
        payload: new URLSearchParams({ imagemId: imagem.id }).toString(),
      });

      expect(resposta.statusCode).toBe(302);
      expect(resposta.headers.location).toBe(`/admin/imoveis/${imovelId}/editar?feito=foto_removida`);
      expect(fotoPelaUrl(url)).toBeUndefined();
      expect(arquivosNaPasta()).toHaveLength(0);

      const pagina = await app.inject({
        method: 'GET',
        url: resposta.headers.location!,
        headers: { cookie },
      });
      expect(pagina.body).toContain('Foto removida.');
      expect(pagina.body).toContain('Nenhuma foto enviada.');
    });

    it('protege a rota de foto do painel sem sessão', async () => {
      const { payload, limite } = corpoMultipart({
        campos: { alt: 'Invasão' },
        arquivo: { nome: 'invasao.jpg', conteudo: JPEG },
      });

      const resposta = await app.inject({
        method: 'POST',
        url: `/admin/imoveis/${imovelId}/fotos`,
        headers: { 'content-type': `multipart/form-data; boundary=${limite}` },
        payload,
      });

      expect(resposta.statusCode).toBe(302);
      expect(resposta.headers.location).toBe('/admin/login');
      expect(arquivosNaPasta()).toHaveLength(0);
    });

    it('escapa a descrição digitada ao mostrar a lista de fotos', async () => {
      await enviarFoto({
        campos: { alt: '<script>alert(1)</script>' },
        arquivo: { nome: 'escapismo.jpg', conteudo: JPEG },
      });

      const pagina = await app.inject({
        method: 'GET',
        url: `/admin/imoveis/${imovelId}/editar`,
        headers: { cookie },
      });

      expect(pagina.body).not.toContain('<script>alert(1)</script>');
      expect(pagina.body).toContain('&lt;script&gt;');
    });
  });
});
