import { DominioInvalidoError, type ErroCampo } from './erros.js';
import { Imovel, type ImovelProps, type Tipologia } from './imovel.base.js';
import { calcularPrecoPorM2, type PrecoVo } from './moeda.js';

export interface ApartamentoProps extends ImovelProps {
  areaPrivativa: string;
  andar: number;
}

export class Apartamento extends Imovel {
  public readonly tipologia: Tipologia = 'apartamento';
  public areaPrivativa: string;
  public andar: number;

  constructor(props: ApartamentoProps) {
    super(props);
    this.areaPrivativa = props.areaPrivativa;
    this.andar = props.andar;

    this.validarRegrasTipologia();
  }

  public validarRegrasTipologia(): void {
    const erros: ErroCampo[] = [];

    if (!this.areaPrivativa || !/^\d+(\.\d{1,2})?$/.test(this.areaPrivativa)) {
      erros.push({
        campo: 'areaPrivativa',
        codigo: 'obrigatorio_decimal',
        mensagem: 'Área privativa é obrigatória e deve ser um decimal válido em m².',
      });
    }

    if (typeof this.andar !== 'number' || !Number.isInteger(this.andar)) {
      erros.push({
        campo: 'andar',
        codigo: 'obrigatorio_inteiro',
        mensagem: 'Andar é obrigatório e deve ser um número inteiro.',
      });
    }

    if (erros.length > 0) {
      throw new DominioInvalidoError('Falha na validação de campos de Apartamento.', erros);
    }
  }

  public calcularPrecoPorM2(): PrecoVo | null {
    return calcularPrecoPorM2(this.preco, this.areaPrivativa);
  }
}
