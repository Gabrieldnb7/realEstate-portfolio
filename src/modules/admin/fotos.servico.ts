// Casos de uso das fotos: enviar, remover e manter a capa. A gravação no disco só acontece
// depois que tudo foi conferido, para entrada inválida não deixar arquivo órfão.
import { randomUUID } from 'node:crypto';
import { DominioInvalidoError, Imagem, LIMITE_IMAGENS_POR_IMOVEL } from '../../entities/index.js';
import { apagarArquivoPelaUrl, guardarImagem } from '../../infra/armazenamento/upload.js';
import {
  buscarImagem,
  contarImagens,
  inserirImagem,
  removerImagem,
} from '../../repositories/imoveis/imagem.repositorio.js';
import { imovelExiste } from '../../repositories/imoveis/imovel.repositorio.js';
import { ImovelNaoEncontradoError } from './imoveis.servico.js';

export class ImagemNaoEncontradaError extends Error {
  constructor() {
    super('imagem_nao_encontrada');
    this.name = 'ImagemNaoEncontradaError';
  }
}

export interface FotoCriada {
  id: string;
  url: string;
}

export interface DadosDaFoto {
  conteudo: Buffer;
  nomeOriginal: string;
  alt: string | null;
}

export function adicionarFoto(imovelId: string, dados: DadosDaFoto): FotoCriada {
  if (!imovelExiste(imovelId)) throw new ImovelNaoEncontradoError();

  const alt = (dados.alt ?? '').trim();
  if (alt === '') {
    throw new DominioInvalidoError('dados_invalidos', [{ campo: 'alt', codigo: 'obrigatorio' }]);
  }

  if (contarImagens(imovelId) >= LIMITE_IMAGENS_POR_IMOVEL) {
    throw new DominioInvalidoError('dados_invalidos', [{ campo: 'imagens', codigo: 'limite_excedido' }]);
  }

  // Formato e tamanho já foram conferidos na entrada; aqui o disco recebe o nome gerado por nós.
  const armazenada = guardarImagem(dados.conteudo, dados.nomeOriginal);
  const imagem = new Imagem({ url: armazenada.url, alt });
  const id = randomUUID();

  inserirImagem({
    id,
    imovelId,
    url: imagem.url,
    alt: imagem.alt,
    ordem: contarImagens(imovelId),
    criadoEm: new Date().toISOString(),
  });

  return { id, url: imagem.url };
}

export function removerFoto(imovelId: string, imagemId: string): void {
  if (!imovelExiste(imovelId)) throw new ImovelNaoEncontradoError();

  const imagem = buscarImagem(imovelId, imagemId);
  if (!imagem) throw new ImagemNaoEncontradaError();

  removerImagem(imovelId, imagemId);
  apagarArquivoPelaUrl(imagem.url);
}
