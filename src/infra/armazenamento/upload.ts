import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

export const LIMITE_BYTES_POR_IMAGEM = 5 * 1024 * 1024;

export type FormatoImagem = 'jpeg' | 'png' | 'webp';

const EXTENSOES_ACEITAS: Record<string, FormatoImagem> = {
  '.jpg': 'jpeg',
  '.jpeg': 'jpeg',
  '.png': 'png',
  '.webp': 'webp',
};

const CONTENT_TYPE: Record<FormatoImagem, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

const SUFIXO_ARQUIVO: Record<FormatoImagem, string> = {
  jpeg: 'jpg',
  png: 'png',
  webp: 'webp',
};

const CABECALHO_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

// O que define o formato são os primeiros bytes do arquivo, não o nome nem o cabeçalho enviado.
function formatoDoConteudo(conteudo: Buffer): FormatoImagem | null {
  if (conteudo[0] === 0xff && conteudo[1] === 0xd8 && conteudo[2] === 0xff) return 'jpeg';

  if (CABECALHO_PNG.every((byte, indice) => conteudo[indice] === byte)) return 'png';

  if (
    conteudo.subarray(0, 4).toString('latin1') === 'RIFF' &&
    conteudo.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'webp';
  }

  return null;
}

export class FormatodeImagemInvalidoError extends Error {
  constructor() {
    super('formato_imagem_invalido');
    this.name = 'FormatodeImagemInvalidoError';
  }
}

export interface ImagemArmazenada {
  arquivo: string;
  url: string;
}

export function pastaDeUploads(): string {
  const configurado = (process.env.UPLOAD_DIR ?? '').trim();
  const pasta = resolve(configurado === '' ? './uploads' : configurado);

  mkdirSync(pasta, { recursive: true });
  return pasta;
}

export function guardarImagem(conteudo: Buffer, nomeOriginal: string): ImagemArmazenada {
  const extensao = extname(nomeOriginal).toLowerCase();
  const formatoPeloNome = EXTENSOES_ACEITAS[extensao];
  const formatoReal = formatoDoConteudo(conteudo);

  if (!formatoPeloNome || !formatoReal || formatoPeloNome !== formatoReal) {
    throw new FormatodeImagemInvalidoError();
  }

  const arquivo = `${randomUUID()}.${SUFIXO_ARQUIVO[formatoReal]}`;
  const caminho = join(pastaDeUploads(), arquivo);

  // 'wx' faz a gravação falhar se o nome já existir, em vez de sobrescrever outra foto.
  writeFileSync(caminho, conteudo, { flag: 'wx' });

  return { arquivo, url: `/media/${arquivo}` };
}

// Nome aceito pela rota pública: só caracteres de arquivo, sem ponto inicial e sem separador de
// caminho, o que por si só descarta qualquer tentativa de traversal.
function caminhoDoArquivo(nome: string): string | null {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/.test(nome)) return null;
  if (!EXTENSOES_ACEITAS[extname(nome).toLowerCase()]) return null;

  const caminho = join(pastaDeUploads(), nome);
  return existsSync(caminho) ? caminho : null;
}

export interface RespostaMidia {
  caminho: string;
  contentType: string;
  tamanho: number;
}

export function abrirMidia(nome: string): RespostaMidia | null {
  const caminho = caminhoDoArquivo(nome);
  if (!caminho) return null;

  const estatisticas = statSync(caminho);
  if (!estatisticas.isFile()) return null;

  const formato = EXTENSOES_ACEITAS[extname(caminho).toLowerCase()];
  if (!formato) return null;

  return { caminho, contentType: CONTENT_TYPE[formato], tamanho: estatisticas.size };
}

export function apagarArquivoPelaUrl(url: string): void {
  const prefixo = '/media/';
  if (!url.startsWith(prefixo)) return;

  const caminho = caminhoDoArquivo(url.slice(prefixo.length));
  if (!caminho) return;

  rmSync(caminho, { force: true });
}
