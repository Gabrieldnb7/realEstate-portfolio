import { DominioInvalidoError, type ErroCampo } from './erros.js';
import { Imovel, type ImovelProps, type Tipologia } from './imovel.base.js';
import { calcularPrecoPorM2, type PrecoVo } from './moeda.js';

export interface VillaProps extends ImovelProps {
  areaConstruida: string;
  areaTerreno: string;
}

export class Villa extends Imovel {
  public readonly tipologia: Tipologia = 'villa';
  public areaConstruida: string;
  public areaTerreno: string;

  constructor(props: VillaProps) {
    super(props);
    this.areaConstruida = props.areaConstruida;
    this.areaTerreno = props.areaTerreno;

    this.validarRegrasTipologia();
  }

  public validarRegrasTipologia(): void {
    const erros: ErroCampo[] = [];

    if (!this.areaConstruida || !/^\d+(\.\d{1,2})?$/.test(this.areaConstruida)) {
      erros.push({
        campo: 'areaConstruida',
        codigo: 'obrigatorio_decimal',
        mensagem: 'Área construída é obrigatória e deve ser um decimal válido em m².',
      });
    }

    if (!this.areaTerreno || !/^\d+(\.\d{1,2})?$/.test(this.areaTerreno)) {
      erros.push({
        campo: 'areaTerreno',
        codigo: 'obrigatorio_decimal',
        mensagem: 'Área do terreno é obrigatória e deve ser um decimal válido em m².',
      });
    }

    if (erros.length > 0) {
      throw new DominioInvalidoError('Falha na validação de campos de Villa.', erros);
    }
  }

  public calcularPrecoPorM2(): PrecoVo | null {
    return calcularPrecoPorM2(this.preco, this.areaConstruida);
  }
}
