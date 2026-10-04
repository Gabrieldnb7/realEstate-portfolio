export type Praca = 'BR' | 'PA' | 'AE';
export type Moeda = 'BRL' | 'USD' | 'AED';

export const MOEDA_POR_PRACA: Record<Praca, Moeda> = {
  BR: 'BRL',
  PA: 'USD',
  AE: 'AED',
};

export interface PrecoVo {
  valor: string; // Formato decimal com ponto e até 2 casas, ex: "4850000.10"
  moeda: Moeda;
}

export function validarPreco(preco: PrecoVo, pais: Praca): void {
  const moedaEsperada = MOEDA_POR_PRACA[pais];
  if (preco.moeda !== moedaEsperada) {
    throw new Error(`Moeda incompatível para o país ${pais}. Esperado: ${moedaEsperada}, recebido: ${preco.moeda}`);
  }

  // Valida formato decimal
  const regexValor = /^\d+(\.\d{1,2})?$/;
  if (!regexValor.test(preco.valor)) {
    throw new Error(`Valor de preço inválido: "${preco.valor}". Deve ser numérico com até duas casas decimais.`);
  }

  const num = Number.parseFloat(preco.valor);
  if (Number.isNaN(num) || num < 0) {
    throw new Error(`Valor de preço não pode ser negativo ou NaN: "${preco.valor}"`);
  }
}

export function calcularPrecoPorM2(preco: PrecoVo | null, areaM2Str: string | null): PrecoVo | null {
  if (!preco || !areaM2Str) {
    return null;
  }

  const valor = Number.parseFloat(preco.valor);
  const area = Number.parseFloat(areaM2Str);

  if (Number.isNaN(valor) || Number.isNaN(area) || area <= 0) {
    return null;
  }

  const precoM2 = (valor / area).toFixed(2);

  return {
    valor: precoM2,
    moeda: preco.moeda,
  };
}
