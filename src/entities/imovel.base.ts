import { DominioInvalidoError, type ErroCampo } from './erros.js';
import { type Imagem } from './imagem.js';
import { type Praca, type PrecoVo, validarPreco } from './moeda.js';
import { type SituacaoImovel, validarTransicaoSituacao } from './situacao.js';

export type Tipologia = 'apartamento' | 'penthouse' | 'villa' | 'estate';

// Anexo C, seção 6: de 1 a 12 fotos por imóvel.
export const LIMITE_IMAGENS_POR_IMOVEL = 12;

export const TIPOLOGIAS_VALIDAS: readonly Tipologia[] = [
  'apartamento',
  'penthouse',
  'villa',
  'estate',
] as const;

// Anexo C, seção 3: o preço por m² da ficha é calculado sobre a área privativa em apartamento e
// penthouse, e sobre a área construída em villa e estate.
export function areaBaseParaPrecoPorM2(
  tipologia: Tipologia,
  areas: { areaPrivativa: string | null; areaConstruida: string | null }
): string | null {
  return tipologia === 'apartamento' || tipologia === 'penthouse'
    ? areas.areaPrivativa
    : areas.areaConstruida;
}

export interface ImovelProps {
  id?: string | undefined;
  ref: string;
  titulo: string;
  pais: Praca;
  cidade: string;
  bairro: string;
  descricao: string;
  preco: PrecoVo | null;
  quartos: number;
  banheiros?: number | null | undefined;
  vagas?: number | null | undefined;
  parceiro: string;
  situacao?: SituacaoImovel | undefined;
  imagens?: Imagem[] | undefined;
  slug?: string | undefined;
}

export abstract class Imovel {
  public readonly id?: string | undefined;
  public readonly ref: string;
  public titulo: string;
  public readonly pais: Praca;
  public cidade: string;
  public bairro: string;
  public descricao: string;
  public preco: PrecoVo | null;
  public quartos: number;
  public banheiros: number | null;
  public vagas: number | null;
  public parceiro: string;

  protected _situacao: SituacaoImovel;
  protected _imagens: Imagem[];
  protected _slug?: string | undefined;

  public abstract readonly tipologia: Tipologia;

  constructor(props: ImovelProps) {
    this.id = props.id;
    this.ref = props.ref.trim();
    this.titulo = props.titulo.trim();
    this.pais = props.pais;
    this.cidade = props.cidade.trim();
    this.bairro = props.bairro.trim();
    this.descricao = props.descricao.trim();
    this.preco = props.preco;
    this.quartos = props.quartos;
    this.banheiros = props.banheiros ?? null;
    this.vagas = props.vagas ?? null;
    this.parceiro = props.parceiro.trim();
    this._situacao = props.situacao ?? 'rascunho';
    this._imagens = props.imagens ? [...props.imagens] : [];
    this._slug = props.slug?.trim() || this.gerarSlug();

    this.validarCamposComuns();
  }

  public get situacao(): SituacaoImovel {
    return this._situacao;
  }

  public get imagens(): readonly Imagem[] {
    return [...this._imagens].sort((a, b) => a.ordem - b.ordem);
  }

  public get slug(): string {
    return this._slug || this.gerarSlug();
  }

  public get capa(): Imagem | null {
    const ordenadas = this.imagens;
    return ordenadas.length > 0 ? (ordenadas[0] ?? null) : null;
  }

  public abstract calcularPrecoPorM2(): PrecoVo | null;
  public abstract validarRegrasTipologia(): void;

  public mudarSituacao(novaSituacao: SituacaoImovel): void {
    const fotosValidas = this._imagens.length >= 1 && this._imagens.every((img) => img.alt && img.alt.trim().length > 0);
    validarTransicaoSituacao(this._situacao, novaSituacao, fotosValidas);
    this._situacao = novaSituacao;
  }

  public adicionarImagem(imagem: Imagem): void {
    if (this._imagens.length >= LIMITE_IMAGENS_POR_IMOVEL) {
      throw new DominioInvalidoError(
        `Limite máximo de ${LIMITE_IMAGENS_POR_IMOVEL} imagens por imóvel atingido.`,
        [
          { campo: 'imagens', codigo: 'limite_excedido' },
        ]
      );
    }

    imagem.ordem = this._imagens.length;
    this._imagens.push(imagem);
  }

  public removerImagem(identificador: string): void {
    const indice = this._imagens.findIndex(
      (img) => img.id === identificador || img.url === identificador
    );

    if (indice === -1) {
      throw new DominioInvalidoError('Imagem não encontrada para remoção.', [
        { campo: 'imagens', codigo: 'nao_encontrada' },
      ]);
    }

    this._imagens.splice(indice, 1);

    // Reajusta a ordenação das imagens remanescentes
    this._imagens.forEach((img, idx) => {
      img.ordem = idx;
    });
  }

  public temWhatsapp(): boolean {
    // Anexo C: "Imóvel publicado tem botão de WhatsApp. Imóvel vendido não tem."
    return this._situacao === 'publicado' || this._situacao === 'reservado';
  }

  public gerarSlug(): string {
    const textoLimpo = `${this.ref}-${this.titulo}`
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    return textoLimpo;
  }

  private validarCamposComuns(): void {
    const erros: ErroCampo[] = [];

    if (!this.ref || !/^[A-Z]{2}-\d{4}$/.test(this.ref)) {
      erros.push({ campo: 'ref', codigo: 'formato_invalido', mensagem: 'Referência deve seguir o formato XX-0000 (ex: BR-0101).' });
    }

    if (!this.titulo) {
      erros.push({ campo: 'titulo', codigo: 'obrigatorio' });
    }

    if (!this.pais || !['BR', 'PA', 'AE'].includes(this.pais)) {
      erros.push({ campo: 'pais', codigo: 'invalido' });
    }

    if (!this.cidade) {
      erros.push({ campo: 'cidade', codigo: 'obrigatorio' });
    }

    if (!this.bairro) {
      erros.push({ campo: 'bairro', codigo: 'obrigatorio' });
    }

    if (!this.descricao) {
      erros.push({ campo: 'descricao', codigo: 'obrigatorio' });
    }

    if (typeof this.quartos !== 'number' || this.quartos < 0 || !Number.isInteger(this.quartos)) {
      erros.push({ campo: 'quartos', codigo: 'inteiro_positivo_obrigatorio' });
    }

    if (this.banheiros !== null && (typeof this.banheiros !== 'number' || this.banheiros < 0 || !Number.isInteger(this.banheiros))) {
      erros.push({ campo: 'banheiros', codigo: 'inteiro_positivo' });
    }

    if (this.vagas !== null && (typeof this.vagas !== 'number' || this.vagas < 0 || !Number.isInteger(this.vagas))) {
      erros.push({ campo: 'vagas', codigo: 'inteiro_positivo' });
    }

    if (!this.parceiro) {
      erros.push({ campo: 'parceiro', codigo: 'obrigatorio' });
    }

    if (this.preco !== null) {
      try {
        validarPreco(this.preco, this.pais);
      } catch (err: unknown) {
        erros.push({ campo: 'preco', codigo: 'invalido', mensagem: err instanceof Error ? err.message : String(err) });
      }
    }

    if (erros.length > 0) {
      throw new DominioInvalidoError('Falha na validação de campos comuns do imóvel.', erros);
    }
  }
}
