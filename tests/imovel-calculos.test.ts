import { describe, expect, it } from 'vitest';
import { Apartamento, Estate, Penthouse, Villa, criarImovel } from '../src/entities/index.js';

describe('Cálculos de Preço por m² e Moeda', () => {
  it('deve calcular preço por m² de Apartamento com base na área privativa', () => {
    const apto = new Apartamento({
      ref: 'BR-0101',
      titulo: 'Apartamento Alameda Lorena',
      pais: 'BR',
      cidade: 'São Paulo',
      bairro: 'Jardins',
      descricao: 'Apartamento de alto padrão',
      preco: { valor: '4850000.10', moeda: 'BRL' },
      areaPrivativa: '212.00',
      andar: 14,
      quartos: 3,
      parceiro: 'Parceiro Local Sul 01',
    });

    const precoM2 = apto.calcularPrecoPorM2();

    expect(precoM2).not.toBeNull();
    // 4850000.10 / 212 = 22877.3589... -> 22877.36
    expect(precoM2?.valor).toBe('22877.36');
    expect(precoM2?.moeda).toBe('BRL');
  });

  it('deve calcular preço por m² de Penthouse com base na área privativa', () => {
    const penthouse = new Penthouse({
      ref: 'BR-0102',
      titulo: 'Penthouse Vila Nova Conceição',
      pais: 'BR',
      cidade: 'São Paulo',
      bairro: 'Vila Nova Conceição',
      descricao: 'Cobertura duplex',
      preco: { valor: '12400000.00', moeda: 'BRL' },
      areaPrivativa: '486.00',
      andar: 22,
      quartos: 4,
      parceiro: 'Parceiro Local Sul 01',
    });

    const precoM2 = penthouse.calcularPrecoPorM2();

    expect(precoM2).not.toBeNull();
    // 12400000 / 486 = 25514.4032... -> 25514.40
    expect(precoM2?.valor).toBe('25514.40');
    expect(precoM2?.moeda).toBe('BRL');
  });

  it('deve calcular preço por m² de Villa com base na área construída', () => {
    const villa = new Villa({
      ref: 'PA-0203',
      titulo: 'Villa Coronado Beach',
      pais: 'PA',
      cidade: 'Coronado',
      bairro: 'Playa Coronado',
      descricao: 'Casa de praia',
      preco: { valor: '1890000.00', moeda: 'USD' },
      areaConstruida: '420.00',
      areaTerreno: '1100.00',
      quartos: 4,
      parceiro: 'Parceiro Local Istmo 02',
    });

    const precoM2 = villa.calcularPrecoPorM2();

    expect(precoM2).not.toBeNull();
    // 1890000 / 420 = 4500.00
    expect(precoM2?.valor).toBe('4500.00');
    expect(precoM2?.moeda).toBe('USD');
  });

  it('deve calcular preço por m² de Estate com base na área construída e moeda AED', () => {
    const estate = new Estate({
      ref: 'AE-0304',
      titulo: 'Estate Emirates Hills',
      pais: 'AE',
      cidade: 'Dubai',
      bairro: 'Emirates Hills',
      descricao: 'Residência em lote de frente para o campo de golfe',
      preco: { valor: '48000000.00', moeda: 'AED' },
      areaConstruida: '1718.71',
      areaTerreno: '2972.90',
      quartos: 7,
      parceiro: 'Parceiro Local Golfo 03',
    });

    const precoM2 = estate.calcularPrecoPorM2();

    expect(precoM2).not.toBeNull();
    // 48000000 / 1718.71 = 27927.9226... -> 27927.92
    expect(precoM2?.valor).toBe('27927.92');
    expect(precoM2?.moeda).toBe('AED');
  });

  it('deve retornar null para imóvel sob consulta (preço null)', () => {
    const imovel = criarImovel({
      tipologia: 'estate',
      ref: 'BR-0104',
      titulo: 'Estate Fazenda Boa Vista',
      pais: 'BR',
      cidade: 'Porto Feliz',
      bairro: 'Fazenda Boa Vista',
      descricao: 'Residência em condomínio de campo',
      preco: null,
      areaConstruida: '1150.00',
      areaTerreno: '20000.00',
      quartos: 6,
      parceiro: 'Parceiro Local Sul 01',
    });

    expect(imovel.preco).toBeNull();
    expect(imovel.calcularPrecoPorM2()).toBeNull();
  });
});
