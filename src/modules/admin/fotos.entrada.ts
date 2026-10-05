// O formulário e a API mandam a foto em multipart; aqui as partes viram dados previsíveis.
import type { FastifyRequest } from 'fastify';

export class ArquivoGrandeDemaisError extends Error {
  constructor() {
    super('arquivo_grande_demais');
    this.name = 'ArquivoGrandeDemaisError';
  }
}

export interface ParteDeArquivo {
  conteudo: Buffer;
  nomeOriginal: string;
}

export interface EntradaDeUpload {
  arquivo: ParteDeArquivo | null;
  alt: string | null;
}

const CAMINHO_DA_REJEICAO = new Set([
  'FST_REQ_FILE_TOO_LARGE',
  'FST_PARTS_LIMIT',
  'FST_FILES_LIMIT',
  'FST_FIELDS_LIMIT',
]);

function comoTexto(valor: unknown): string | null {
  if (typeof valor === 'string') return valor;
  if (typeof valor === 'number') return String(valor);
  return null;
}

export async function lerUploadDeImagem(request: FastifyRequest): Promise<EntradaDeUpload> {
  if (!request.isMultipart()) {
    return { arquivo: null, alt: null };
  }

  let arquivo: ParteDeArquivo | null = null;
  let alt: string | null = null;

  // Todas as partes são lidas mesmo quando a foto é rejeitada: parar no meio deixaria o corpo
  // da requisição pela metade e a conexão ficaria suja.
  for await (const parte of request.parts()) {
    if (parte.type !== 'file') {
      if (parte.fieldname === 'alt') alt = comoTexto(parte.value);
      continue;
    }

    if (arquivo) continue;

    try {
      const conteudo = await parte.toBuffer();
      arquivo = { conteudo, nomeOriginal: parte.filename };
    } catch (erro) {
      const codigo = (erro as { code?: string }).code ?? '';
      if (CAMINHO_DA_REJEICAO.has(codigo)) throw new ArquivoGrandeDemaisError();
      throw erro;
    }
  }

  return { arquivo, alt };
}
