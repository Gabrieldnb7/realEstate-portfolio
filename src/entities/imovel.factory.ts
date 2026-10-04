import { Apartamento } from './apartamento.js';
import { DominioInvalidoError } from './erros.js';
import { Estate } from './estate.js';
import { type Imovel, type Tipologia } from './imovel.base.js';
import { Penthouse } from './penthouse.js';
import { type Praca, type PrecoVo } from './moeda.js';
import { type SituacaoImovel } from './situacao.js';
import { Villa } from './villa.js';

export interface CriarImovelInput {
  id?: string;
  ref: string;
  titulo: string;
  tipologia: Tipologia;
  pais: Praca;
  cidade: string;
  bairro: string;
  descricao: string;
  preco: PrecoVo | null;
  areaPrivativa?: string | null;
  areaConstruida?: string | null;
  areaTerreno?: string | null;
  quartos: number;
  banheiros?: number | null;
  vagas?: number | null;
  andar?: number | null;
  parceiro: string;
  situacao?: SituacaoImovel;
  slug?: string;
}

export function criarImovel(input: CriarImovelInput): Imovel {
  const baseProps = {
    id: input.id,
    ref: input.ref,
    titulo: input.titulo,
    pais: input.pais,
    cidade: input.cidade,
    bairro: input.bairro,
    descricao: input.descricao,
    preco: input.preco,
    quartos: input.quartos,
    banheiros: input.banheiros,
    vagas: input.vagas,
    parceiro: input.parceiro,
    situacao: input.situacao,
    slug: input.slug,
  };

  switch (input.tipologia) {
    case 'apartamento':
      return new Apartamento({
        ...baseProps,
        areaPrivativa: input.areaPrivativa ?? '',
        andar: input.andar ?? (NaN as unknown as number),
      });

    case 'penthouse':
      return new Penthouse({
        ...baseProps,
        areaPrivativa: input.areaPrivativa ?? '',
        andar: input.andar ?? (NaN as unknown as number),
      });

    case 'villa':
      return new Villa({
        ...baseProps,
        areaConstruida: input.areaConstruida ?? '',
        areaTerreno: input.areaTerreno ?? '',
      });

    case 'estate':
      return new Estate({
        ...baseProps,
        areaConstruida: input.areaConstruida ?? '',
        areaTerreno: input.areaTerreno ?? '',
      });

    default:
      throw new DominioInvalidoError(`Tipologia desconhecida: "${input.tipologia as string}".`, [
        { campo: 'tipologia', codigo: 'invalida' },
      ]);
  }
}
