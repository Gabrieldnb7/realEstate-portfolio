import { describe, expect, it } from 'vitest';
import {
  Apartamento,
  DominioInvalidoError,
  Imagem,
} from '../src/entities/index.js';

function instanciarApartamentoExemplo(): Apartamento {
  return new Apartamento({
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
}

describe('Máquina de Estados de Situação e Regras de Publicação', () => {
  it('deve iniciar com situação "rascunho" por padrão', () => {
    const imovel = instanciarApartamentoExemplo();
    expect(imovel.situacao).toBe('rascunho');
    expect(imovel.temWhatsapp()).toBe(false);
  });

  it('deve falhar ao transicionar para "publicado" sem nenhuma foto', () => {
    const imovel = instanciarApartamentoExemplo();

    expect(() => {
      imovel.mudarSituacao('publicado');
    }).toThrowError(DominioInvalidoError);
  });

  it('deve falhar ao transicionar para "publicado" se alguma foto tiver descrição (alt) vazia', () => {
    const imovel = instanciarApartamentoExemplo();

    // Foto sem descrição
    expect(() => {
      new Imagem({ url: '/media/foto1.jpg', alt: '' });
    }).toThrowError(DominioInvalidoError);
  });

  it('deve permitir transição para "publicado" com pelo menos uma foto com descrição', () => {
    const imovel = instanciarApartamentoExemplo();

    imovel.adicionarImagem(
      new Imagem({ url: '/media/foto1.jpg', alt: 'Fachada frontal do edifício' })
    );

    imovel.mudarSituacao('publicado');
    expect(imovel.situacao).toBe('publicado');
    expect(imovel.temWhatsapp()).toBe(true);
  });

  it('deve permitir transição de "publicado" para "reservado" mantendo botão de WhatsApp', () => {
    const imovel = instanciarApartamentoExemplo();
    imovel.adicionarImagem(new Imagem({ url: '/media/foto1.jpg', alt: 'Fachada' }));

    imovel.mudarSituacao('publicado');
    imovel.mudarSituacao('reservado');

    expect(imovel.situacao).toBe('reservado');
    expect(imovel.temWhatsapp()).toBe(true);
  });

  it('deve bloquear botão de WhatsApp quando a situação for "vendido"', () => {
    const imovel = instanciarApartamentoExemplo();
    imovel.adicionarImagem(new Imagem({ url: '/media/foto1.jpg', alt: 'Fachada' }));

    imovel.mudarSituacao('publicado');
    imovel.mudarSituacao('vendido');

    expect(imovel.situacao).toBe('vendido');
    expect(imovel.temWhatsapp()).toBe(false);
  });

  it('deve impedir qualquer mudança de situação a partir de um imóvel "vendido"', () => {
    const imovel = instanciarApartamentoExemplo();
    imovel.adicionarImagem(new Imagem({ url: '/media/foto1.jpg', alt: 'Fachada' }));

    imovel.mudarSituacao('publicado');
    imovel.mudarSituacao('vendido');

    // Regra: Vendido não volta a ser oferecido
    expect(() => {
      imovel.mudarSituacao('publicado');
    }).toThrowError(DominioInvalidoError);

    expect(() => {
      imovel.mudarSituacao('rascunho');
    }).toThrowError(DominioInvalidoError);

    expect(() => {
      imovel.mudarSituacao('reservado');
    }).toThrowError(DominioInvalidoError);

    expect(() => {
      imovel.mudarSituacao('arquivado');
    }).toThrowError(DominioInvalidoError);
  });

  it('deve definir a primeira foto enviada como capa e reordenar na remoção', () => {
    const imovel = instanciarApartamentoExemplo();

    const foto1 = new Imagem({ id: 'f1', url: '/media/foto1.jpg', alt: 'Foto 1' });
    const foto2 = new Imagem({ id: 'f2', url: '/media/foto2.jpg', alt: 'Foto 2' });

    imovel.adicionarImagem(foto1);
    imovel.adicionarImagem(foto2);

    expect(imovel.capa?.url).toBe('/media/foto1.jpg');

    // Remove foto1 -> foto2 deve virar a capa
    imovel.removerImagem('f1');
    expect(imovel.imagens.length).toBe(1);
    expect(imovel.capa?.url).toBe('/media/foto2.jpg');
    expect(imovel.imagens[0]?.ordem).toBe(0);
  });

  it('deve limitar a galeria a no máximo 12 imagens', () => {
    const imovel = instanciarApartamentoExemplo();

    for (let i = 1; i <= 12; i++) {
      imovel.adicionarImagem(new Imagem({ url: `/media/foto${i}.jpg`, alt: `Foto ${i}` }));
    }

    expect(imovel.imagens.length).toBe(12);

    expect(() => {
      imovel.adicionarImagem(new Imagem({ url: '/media/foto13.jpg', alt: 'Foto 13' }));
    }).toThrowError(DominioInvalidoError);
  });
});
