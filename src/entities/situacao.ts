import { DominioInvalidoError } from './erros.js';

export type SituacaoImovel = 'rascunho' | 'publicado' | 'reservado' | 'vendido' | 'arquivado';

export const SITUACOES_VALIDAS: readonly SituacaoImovel[] = [
  'rascunho',
  'publicado',
  'reservado',
  'vendido',
  'arquivado',
] as const;

export function validarTransicaoSituacao(
  situacaoAtual: SituacaoImovel,
  novaSituacao: SituacaoImovel,
  temFotosValidasParaPublicacao: boolean
): void {
  if (situacaoAtual === novaSituacao) {
    return;
  }

  if (situacaoAtual === 'vendido') {
    throw new DominioInvalidoError('Imóvel vendido não pode ter sua situação alterada.', [
      { campo: 'situacao', codigo: 'vendido_imutavel' },
    ]);
  }

  if (novaSituacao === 'publicado' && !temFotosValidasParaPublicacao) {
    throw new DominioInvalidoError(
      'Imóvel só pode ser publicado com pelo menos uma foto e descrição em todas as fotos.',
      [{ campo: 'imagens', codigo: 'fotos_obrigatorias_para_publicacao' }]
    );
  }
}
