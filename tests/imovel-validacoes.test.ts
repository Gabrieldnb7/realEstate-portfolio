import { describe, expect, it } from 'vitest';
import {
  Apartamento,
  DominioInvalidoError,
  Villa,
  criarImovel,
} from '../src/entities/index.js';

describe('Validações de Regras do Catálogo e Tipologias', () => {
  it('deve lançar erro se Apartamento não possuir área privativa válida', () => {
    expect(() => {
      new Apartamento({
        ref: 'BR-0101',
        titulo: 'Apartamento Teste',
        pais: 'BR',
        cidade: 'São Paulo',
        bairro: 'Jardins',
        descricao: 'Descrição',
        preco: { valor: '1000000.00', moeda: 'BRL' },
        areaPrivativa: '',
        andar: 5,
        quartos: 2,
        parceiro: 'Parceiro',
      });
    }).toThrowError(DominioInvalidoError);
  });

  it('deve lançar erro se Apartamento não possuir andar definido', () => {
    expect(() => {
      new Apartamento({
        ref: 'BR-0101',
        titulo: 'Apartamento Teste',
        pais: 'BR',
        cidade: 'São Paulo',
        bairro: 'Jardins',
        descricao: 'Descrição',
        preco: { valor: '1000000.00', moeda: 'BRL' },
        areaPrivativa: '100.00',
        andar: NaN,
        quartos: 2,
        parceiro: 'Parceiro',
      });
    }).toThrowError(DominioInvalidoError);
  });

  it('deve lançar erro se Villa não possuir área construída ou de terreno', () => {
    expect(() => {
      new Villa({
        ref: 'BR-0103',
        titulo: 'Villa Jardim Pernambuco',
        pais: 'BR',
        cidade: 'Rio de Janeiro',
        bairro: 'Jardim Pernambuco',
        descricao: 'Casa em três pavimentos',
        preco: { valor: '9700000.00', moeda: 'BRL' },
        areaConstruida: '',
        areaTerreno: '540.00',
        quartos: 5,
        parceiro: 'Parceiro',
      });
    }).toThrowError(DominioInvalidoError);

    expect(() => {
      new Villa({
        ref: 'BR-0103',
        titulo: 'Villa Jardim Pernambuco',
        pais: 'BR',
        cidade: 'Rio de Janeiro',
        bairro: 'Jardim Pernambuco',
        descricao: 'Casa em três pavimentos',
        preco: { valor: '9700000.00', moeda: 'BRL' },
        areaConstruida: '620.00',
        areaTerreno: '',
        quartos: 5,
        parceiro: 'Parceiro',
      });
    }).toThrowError(DominioInvalidoError);
  });

  it('deve rejeitar moeda incompatível com o país (ex: Panamá com BRL ou Brasil com USD)', () => {
    expect(() => {
      new Apartamento({
        ref: 'PA-0201',
        titulo: 'Apartamento Panamá',
        pais: 'PA',
        cidade: 'Cidade do Panamá',
        bairro: 'Costa del Este',
        descricao: 'Descrição',
        preco: { valor: '1250000.00', moeda: 'BRL' },
        areaPrivativa: '180.00',
        andar: 28,
        quartos: 3,
        parceiro: 'Parceiro',
      });
    }).toThrowError(DominioInvalidoError);
  });

  it('deve rejeitar referência fora do padrão XX-0000', () => {
    expect(() => {
      new Apartamento({
        ref: 'INVALIDA-REF',
        titulo: 'Apartamento Inválido',
        pais: 'BR',
        cidade: 'São Paulo',
        bairro: 'Jardins',
        descricao: 'Descrição',
        preco: { valor: '1000000.00', moeda: 'BRL' },
        areaPrivativa: '100.00',
        andar: 1,
        quartos: 2,
        parceiro: 'Parceiro',
      });
    }).toThrowError(DominioInvalidoError);
  });

  it('deve instanciar tipologias polimorficamente via criarImovel factory', () => {
    const apto = criarImovel({
      tipologia: 'apartamento',
      ref: 'BR-0101',
      titulo: 'Apartamento Alameda Lorena',
      pais: 'BR',
      cidade: 'São Paulo',
      bairro: 'Jardins',
      descricao: 'Descrição',
      preco: { valor: '4850000.10', moeda: 'BRL' },
      areaPrivativa: '212.00',
      andar: 14,
      quartos: 3,
      parceiro: 'Parceiro',
    });

    expect(apto.tipologia).toBe('apartamento');
    expect(apto.slug).toBe('br-0101-apartamento-alameda-lorena');
  });

  it('deve lançar erro ao passar tipologia desconhecida na factory', () => {
    expect(() => {
      criarImovel({
        // @ts-expect-error testando tipologia inexistente em runtime
        tipologia: 'cobertura_desconhecida',
        ref: 'BR-0101',
        titulo: 'Imóvel',
        pais: 'BR',
        cidade: 'São Paulo',
        bairro: 'Jardins',
        descricao: 'Descrição',
        preco: null,
        quartos: 1,
        parceiro: 'Parceiro',
      });
    }).toThrowError(DominioInvalidoError);
  });
});
