// Linhas do bloco de detalhamento do painel. O que a tabela mostra é decisão de tela, então o
// texto pronto nasce aqui e o template só desenha; o read model continua sem formato de exibição.
import type { ResumoPainel } from '../repositories/imoveis/imovel.repositorio.js';
import { precoParaTela } from './formatar.valores.js';

export interface LinhaPainel {
  id: string;
  ref: string;
  titulo: string;
  tipologia: string;
  pais: string;
  cidade: string;
  bairro: string;
  preco: string;
  totalFotos: number;
  fotosSemDescricao: number;
  situacao: string;
  atualizado: string;
  urlEditar: string;
  urlExcluir: string;
}

// O timestamp do banco é ISO; na tabela basta o dia, mês e ano.
function dataParaTela(ISO: string): string {
  const [ano, mes, dia] = ISO.slice(0, 10).split('-');
  if (!ano || !mes || !dia) return ISO.slice(0, 10);
  return `${dia}/${mes}/${ano}`;
}

export function linhaDoPainel(resumo: ResumoPainel): LinhaPainel {
  return {
    id: resumo.id,
    ref: resumo.ref,
    titulo: resumo.titulo,
    tipologia: resumo.tipologia,
    pais: resumo.pais,
    cidade: resumo.cidade,
    bairro: resumo.bairro,
    preco: precoParaTela(resumo.preco) ?? 'a consultar',
    totalFotos: resumo.totalFotos,
    fotosSemDescricao: resumo.fotosSemDescricao,
    situacao: resumo.situacao,
    atualizado: dataParaTela(resumo.atualizadoEm),
    urlEditar: `/admin/imoveis/${resumo.id}/editar`,
    urlExcluir: `/admin/imoveis/${resumo.id}/excluir`,
  };
}

export function linhasDoPainel(resumos: ResumoPainel[]): LinhaPainel[] {
  return resumos.map(linhaDoPainel);
}
