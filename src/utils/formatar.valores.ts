// Dinheiro trafega como texto decimal (Anexo D, seção 3); para a tela ele ganha separador de
// milhar e vírgula, sem depender de locale do mecanismo de execução.
import type { Moeda, PrecoVo } from '../entities/index.js';

const SIMBOLO_POR_MOEDA: Record<Moeda, string> = {
  BRL: 'R$',
  USD: 'US$',
  AED: 'AED',
};

export function precoParaTela(preco: PrecoVo | null): string | null {
  if (preco === null) return null;

  const [inteiro, decimais] = preco.valor.split('.');
  const milhar = (inteiro ?? '0').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const casas = decimais ? decimais.padEnd(2, '0').slice(0, 2) : '00';

  return `${SIMBOLO_POR_MOEDA[preco.moeda]} ${milhar},${casas}`;
}
