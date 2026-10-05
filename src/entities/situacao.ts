import { DominioInvalidoError } from './erros.js';

export type SituacaoImovel = 'rascunho' | 'publicado' | 'reservado' | 'vendido' | 'arquivado';

export const SITUACOES_VALIDAS: readonly SituacaoImovel[] = [
  'rascunho',
  'publicado',
  'reservado',
  'vendido',
  'arquivado',
] as const;

// O que existe no painel não é o que vai ao ar. Rascunho e arquivado ficam fora do site público;
// reservado e vendido continuam no catálogo, com o selo da situação.
export const SITUACOES_VISIVEIS_NO_SITE: readonly SituacaoImovel[] = [
  'publicado',
  'reservado',
  'vendido',
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
