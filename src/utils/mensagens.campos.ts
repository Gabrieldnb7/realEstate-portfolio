// Tradução dos códigos de erro por campo para a tela do painel.
// A API devolve os códigos (Anexo D); quem mostra texto para a pessoa usuária é a página.
import type { ErroCampo } from '../entities/index.js';

const MENSAGENS_POR_CODIGO: Record<string, string> = {
  obrigatorio: 'Preenchimento obrigatório.',
  invalido: 'Valor inválido.',
  invalida: 'Valor inválido.',
  duplicado: 'Já existe outro imóvel com esta referência.',
  formato_invalido: 'Formato inválido.',
  inteiro_invalido: 'Use um número inteiro.',
  decimal_invalido: 'Use número com até duas casas decimais, separado por ponto.',
  moeda_invalida: 'Use BRL, USD ou AED.',
  texto_invalido: 'Use texto.',
  vendido_imutavel: 'Imóvel vendido não volta a ser oferecido.',
  fotos_obrigatorias_para_publicacao: 'Publique apenas com pelo menos uma foto e todas as fotos descritas.',
  limite_excedido: 'O imóvel aceita no máximo 12 fotos.',
  arquivo: 'Selecione o arquivo da foto.',
  tamanho: 'A foto precisa ter no máximo 5 MB.',
  formato: 'Formato não aceito. Envie JPEG, PNG ou WebP.',
  descricao: 'Descreva a foto: a descrição aparece para quem visita o site.',
  imagem_nao_encontrada: 'Essa foto não está mais no imóvel.',
};

export function mensagemDoCampo(erro: ErroCampo): string {
  return erro.mensagem ?? MENSAGENS_POR_CODIGO[erro.codigo] ?? 'Valor inválido.';
}

export function errosPorCampo(erros: ErroCampo[]): Record<string, string> {
  const mapa: Record<string, string> = {};
  for (const erro of erros) {
    if (!(erro.campo in mapa)) mapa[erro.campo] = mensagemDoCampo(erro);
  }
  return mapa;
}
