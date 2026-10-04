import { Apartamento, type ApartamentoProps } from './apartamento.js';
import { type Tipologia } from './imovel.base.js';

export interface PenthouseProps extends ApartamentoProps {}

export class Penthouse extends Apartamento {
  public override readonly tipologia: Tipologia = 'penthouse';

  constructor(props: PenthouseProps) {
    super(props);
  }
}
