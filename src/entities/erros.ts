export interface ErroCampo {
  campo: string;
  codigo: string;
  mensagem?: string;
}

export class DominioInvalidoError extends Error {
  public readonly campos: ErroCampo[];

  constructor(mensagem: string, campos: ErroCampo[] = []) {
    super(mensagem);
    this.name = 'DominioInvalidoError';
    this.campos = campos;
  }
}
