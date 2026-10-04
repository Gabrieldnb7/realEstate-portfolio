import { type Tipologia } from './imovel.base.js';
import { Villa, type VillaProps } from './villa.js';

export interface EstateProps extends VillaProps {}

export class Estate extends Villa {
  public override readonly tipologia: Tipologia = 'estate';

  constructor(props: EstateProps) {
    super(props);
  }
}
