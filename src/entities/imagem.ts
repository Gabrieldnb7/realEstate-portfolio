import { DominioInvalidoError } from './erros.js';

export interface ImagemProps {
  id?: string | undefined;
  url: string;
  alt: string;
  ordem?: number | undefined;
}

export class Imagem {
  public readonly id?: string | undefined;
  public readonly url: string;
  public readonly alt: string;
  public ordem: number;

  constructor(props: ImagemProps) {
    if (!props.url || props.url.trim() === '') {
      throw new DominioInvalidoError('URL da imagem é obrigatória.', [
        { campo: 'url', codigo: 'obrigatorio' },
      ]);
    }

    if (!props.alt || props.alt.trim() === '') {
      throw new DominioInvalidoError('Descrição (alt) da imagem é obrigatória.', [
        { campo: 'alt', codigo: 'obrigatorio' },
      ]);
    }

    this.id = props.id;
    this.url = props.url.trim();
    this.alt = props.alt.trim();
    this.ordem = props.ordem ?? 0;
  }
}
