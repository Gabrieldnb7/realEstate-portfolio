// Casos de uso do painel sobre o catálogo: criar, editar e mudar a situação.
// Ler o corpo é a fronteira: converte o que chegou em ficha completa e acumula um erro por
// campo. As regras do catálogo continuam no domínio (src/entities).
import { randomUUID } from 'node:crypto';
import {
  DominioInvalidoError,
  SITUACOES_VALIDAS,
  TIPOLOGIAS_VALIDAS,
  criarImovel,
  validarTransicaoSituacao,
} from '../../entities/index.js';
import type { ErroCampo, Praca, PrecoVo, SituacaoImovel, Tipologia } from '../../entities/index.js';
import {
  atualizarImovel,
  buscarRegistro,
  existeReferencia,
  inserirImovel,
  listarResumos,
  salvarSituacao,
  slugEmUso,
  temFotosValidasParaPublicacao,
} from '../../repositories/imoveis/imovel.repositorio.js';
import type { RegistroImovel, ResumoPainel } from '../../repositories/imoveis/imovel.repositorio.js';

export class ImovelNaoEncontradoError extends Error {
  constructor() {
    super('imovel_nao_encontrado');
    this.name = 'ImovelNaoEncontradoError';
  }
}

/** Marca o DominioInvalidoError que veio de um corpo malformado (400), e não de regra de catálogo (422). */
export const MARCA_REQUISICAO_INVALIDA = 'requisicao_invalida';

export interface ResultadoEscrita {
  id: string;
  ref: string;
  slug: string;
  situacao: SituacaoImovel;
}

interface FichaImovel {
  ref: string;
  titulo: string;
  tipologia: Tipologia;
  pais: Praca;
  cidade: string;
  bairro: string;
  descricao: string;
  preco: PrecoVo | null;
  areaPrivativa: string | null;
  areaConstruida: string | null;
  areaTerreno: string | null;
  quartos: number;
  banheiros: number | null;
  vagas: number | null;
  andar: number | null;
  parceiro: string;
}

type CampoTexto = 'ref' | 'titulo' | 'cidade' | 'bairro' | 'descricao' | 'parceiro';
type CampoDecimal = 'areaPrivativa' | 'areaConstruida' | 'areaTerreno';
type CampoInteiro = 'banheiros' | 'vagas' | 'andar';

const CAMPOS_TEXTO_OBRIGATORIOS: CampoTexto[] = [
  'ref',
  'titulo',
  'cidade',
  'bairro',
  'descricao',
  'parceiro',
];
const CAMPOS_DECIMAIS: CampoDecimal[] = ['areaPrivativa', 'areaConstruida', 'areaTerreno'];
const CAMPOS_INTEIROS_OPCIONAIS: CampoInteiro[] = ['banheiros', 'vagas', 'andar'];

const PRACAS: readonly string[] = ['BR', 'PA', 'AE'];
const MOEDAS: readonly string[] = ['BRL', 'USD', 'AED'];
const PADRAO_DECIMAL = /^\d+(\.\d{1,2})?$/;
const PADRAO_INTEIRO = /^\d+$/;

function comoObjeto(corpo: unknown): Record<string, unknown> {
  if (typeof corpo !== 'object' || corpo === null || Array.isArray(corpo)) {
    throw new DominioInvalidoError(MARCA_REQUISICAO_INVALIDA, [{ campo: 'corpo', codigo: 'invalido' }]);
  }
  return corpo as Record<string, unknown>;
}

function informado(corpo: Record<string, unknown>, campo: string): boolean {
  return Object.prototype.hasOwnProperty.call(corpo, campo);
}

function valorPreenchido(corpo: Record<string, unknown>, campo: string): boolean {
  const valor = corpo[campo];
  if (valor === undefined || valor === null) return false;
  if (typeof valor === 'string') return valor.trim().length > 0;
  return true;
}

function comoTexto(valor: unknown): string | null {
  if (typeof valor === 'string') return valor.trim();
  if (typeof valor === 'number') return String(valor);
  return null;
}

function lerTexto(corpo: Record<string, unknown>, campo: string): string | null {
  return comoTexto(corpo[campo]);
}

function lerInteiro(corpo: Record<string, unknown>, campo: string, erros: ErroCampo[]): number | null {
  const bruto = corpo[campo];
  if (bruto === null || (typeof bruto === 'string' && bruto.trim() === '')) return null;

  if (typeof bruto === 'number') {
    if (!Number.isInteger(bruto)) {
      erros.push({ campo, codigo: 'inteiro_invalido' });
      return null;
    }
    return bruto;
  }

  const texto = String(bruto).trim();
  if (!PADRAO_INTEIRO.test(texto)) {
    erros.push({ campo, codigo: 'inteiro_invalido' });
    return null;
  }
  return Number.parseInt(texto, 10);
}

function lerDecimal(corpo: Record<string, unknown>, campo: string, erros: ErroCampo[]): string | null {
  const bruto = String(corpo[campo] ?? '').trim().replace(',', '.');
  if (!PADRAO_DECIMAL.test(bruto)) {
    erros.push({ campo, codigo: 'decimal_invalido' });
    return null;
  }
  return bruto;
}

function lerPreco(corpo: Record<string, unknown>, erros: ErroCampo[]): PrecoVo | null {
  const bruto = corpo['preco'];
  if (bruto === null || bruto === undefined) return null;
  if (typeof bruto === 'string' && bruto.trim() === '') return null;

  if (typeof bruto !== 'object') {
    erros.push({ campo: 'preco', codigo: 'formato_invalido' });
    return null;
  }

  const objeto = bruto as Record<string, unknown>;
  const valor = String(objeto['valor'] ?? '').trim();
  const moeda = String(objeto['moeda'] ?? '').trim().toUpperCase();

  if (!MOEDAS.includes(moeda)) {
    erros.push({ campo: 'preco.moeda', codigo: 'moeda_invalida' });
    return null;
  }
  if (!PADRAO_DECIMAL.test(valor)) {
    erros.push({ campo: 'preco.valor', codigo: 'decimal_invalido' });
    return null;
  }

  return { valor, moeda: moeda as PrecoVo['moeda'] };
}

function fichaVazia(): FichaImovel {
  return {
    ref: '',
    titulo: '',
    tipologia: 'apartamento',
    pais: 'BR',
    cidade: '',
    bairro: '',
    descricao: '',
    preco: null,
    areaPrivativa: null,
    areaConstruida: null,
    areaTerreno: null,
    quartos: 0,
    banheiros: null,
    vagas: null,
    andar: null,
    parceiro: '',
  };
}

function fichaDoRegistro(registro: RegistroImovel): FichaImovel {
  return {
    ref: registro.ref,
    titulo: registro.titulo,
    tipologia: registro.tipologia,
    pais: registro.pais,
    cidade: registro.cidade,
    bairro: registro.bairro,
    descricao: registro.descricao,
    preco: registro.preco,
    areaPrivativa: registro.areaPrivativa,
    areaConstruida: registro.areaConstruida,
    areaTerreno: registro.areaTerreno,
    quartos: registro.quartos,
    banheiros: registro.banheiros,
    vagas: registro.vagas,
    andar: registro.andar,
    parceiro: registro.parceiro,
  };
}

/**
 * `base` é null na criação (tudo vem do corpo) e a ficha salva na edição, onde só muda
 * o campo que chegou no corpo.
 */
function consolidarFicha(
  corpo: Record<string, unknown>,
  base: FichaImovel | null,
  erros: ErroCampo[]
): FichaImovel {
  const ficha = base ? { ...base } : fichaVazia();

  for (const campo of CAMPOS_TEXTO_OBRIGATORIOS) {
    if (!valorPreenchido(corpo, campo)) {
      if (!base) erros.push({ campo, codigo: 'obrigatorio' });
      continue;
    }
    const texto = lerTexto(corpo, campo);
    if (texto === null) {
      erros.push({ campo, codigo: 'texto_invalido' });
      continue;
    }
    ficha[campo] = texto;
  }

  // quartos vem no corpo sempre; na edição um valor ausente mantém o salvo.
  if (valorPreenchido(corpo, 'quartos') || !base) {
    if (!valorPreenchido(corpo, 'quartos')) {
      erros.push({ campo: 'quartos', codigo: 'obrigatorio' });
    } else {
      ficha.quartos = lerInteiro(corpo, 'quartos', erros) ?? ficha.quartos;
    }
  }

  if (valorPreenchido(corpo, 'tipologia') || !base) {
    const tipologia = comoTexto(corpo['tipologia']);
    if (!tipologia) {
      erros.push({ campo: 'tipologia', codigo: 'obrigatorio' });
    } else if (TIPOLOGIAS_VALIDAS.includes(tipologia as Tipologia)) {
      ficha.tipologia = tipologia as Tipologia;
    } else {
      erros.push({ campo: 'tipologia', codigo: 'invalida' });
    }
  }

  if (valorPreenchido(corpo, 'pais') || !base) {
    const pais = comoTexto(corpo['pais'])?.toUpperCase();
    if (!pais) {
      erros.push({ campo: 'pais', codigo: 'obrigatorio' });
    } else if (PRACAS.includes(pais)) {
      ficha.pais = pais as Praca;
    } else {
      erros.push({ campo: 'pais', codigo: 'invalido' });
    }
  }

  // Trocar a tipologia não pode deixar anexadas as medidas da tipologia anterior.
  // Vem antes da leitura das medidas: o que chegar neste corpo ainda vale.
  if (base && ficha.tipologia !== base.tipologia) {
    ficha.areaPrivativa = null;
    ficha.areaConstruida = null;
    ficha.areaTerreno = null;
    ficha.andar = null;
  }

  for (const campo of CAMPOS_DECIMAIS) {
    if (!informado(corpo, campo)) continue;
    ficha[campo] = valorPreenchido(corpo, campo) ? lerDecimal(corpo, campo, erros) : null;
  }

  for (const campo of CAMPOS_INTEIROS_OPCIONAIS) {
    if (!informado(corpo, campo)) continue;
    if (!valorPreenchido(corpo, campo)) {
      ficha[campo] = null;
      continue;
    }
    const lido = lerInteiro(corpo, campo, erros);
    if (lido !== null) ficha[campo] = lido;
  }

  if (informado(corpo, 'preco')) {
    ficha.preco = lerPreco(corpo, erros);
  }

  return ficha;
}

function gerarSlugUnico(base: string, ignorarId: string): string {
  if (!slugEmUso(base, ignorarId)) return base;

  for (let sufixo = 2; sufixo < 100; sufixo++) {
    const candidato = `${base}-${sufixo}`;
    if (!slugEmUso(candidato, ignorarId)) return candidato;
  }

  return `${base}-${randomUUID().slice(0, 8)}`;
}

function montarAgregado(id: string, slug: string, situacao: SituacaoImovel, ficha: FichaImovel) {
  return criarImovel({ ...ficha, id, slug, situacao });
}

function resultado(id: string, ref: string, slug: string, situacao: SituacaoImovel): ResultadoEscrita {
  return { id, ref, slug, situacao };
}

export function criarImovelNoCatalogo(corpo: unknown): ResultadoEscrita {
  const erros: ErroCampo[] = [];
  const ficha = consolidarFicha(comoObjeto(corpo), null, erros);
  if (erros.length > 0) throw new DominioInvalidoError('dados_invalidos', erros);

  const id = randomUUID();

  if (existeReferencia(ficha.ref, id)) {
    throw new DominioInvalidoError('dados_invalidos', [{ campo: 'ref', codigo: 'duplicado' }]);
  }

  // Passar pelo agregado é o que aplica as regras de tipologia e de moeda da praça.
  const validado = montarAgregado(id, '', 'rascunho', ficha);
  const slug = gerarSlugUnico(validado.slug, id);
  const imovel = slug === validado.slug ? validado : montarAgregado(id, slug, 'rascunho', ficha);

  // Imóvel novo entra como rascunho, venha o que vier no corpo (Anexo C, seção 4).
  inserirImovel(imovel, new Date().toISOString());

  return resultado(id, imovel.ref, imovel.slug, 'rascunho');
}

export function atualizarImovelNoCatalogo(id: string, corpo: unknown): ResultadoEscrita {
  const registro = buscarRegistro(id);
  if (!registro) throw new ImovelNaoEncontradoError();

  const erros: ErroCampo[] = [];
  const ficha = consolidarFicha(comoObjeto(corpo), fichaDoRegistro(registro), erros);
  if (erros.length > 0) throw new DominioInvalidoError('dados_invalidos', erros);

  if (ficha.ref !== registro.ref && existeReferencia(ficha.ref, id)) {
    throw new DominioInvalidoError('dados_invalidos', [{ campo: 'ref', codigo: 'duplicado' }]);
  }

  // O slug não muda na edição: um link colado ou compartilhado continua levando ao imóvel.
  const imovel = montarAgregado(id, registro.slug, registro.situacao, ficha);
  atualizarImovel(imovel, new Date().toISOString());

  return resultado(id, imovel.ref, imovel.slug, imovel.situacao);
}

export function mudarSituacaoDoImovel(id: string, corpo: unknown): ResultadoEscrita {
  const registro = buscarRegistro(id);
  if (!registro) throw new ImovelNaoEncontradoError();

  const destino = comoTexto((comoObjeto(corpo)['situacao'])) ?? '';
  if (!SITUACOES_VALIDAS.includes(destino as SituacaoImovel)) {
    throw new DominioInvalidoError('dados_invalidos', [{ campo: 'situacao', codigo: 'invalida' }]);
  }

  const situacao = destino as SituacaoImovel;
  validarTransicaoSituacao(registro.situacao, situacao, temFotosValidasParaPublicacao(id));

  salvarSituacao(id, situacao, new Date().toISOString());

  return resultado(id, registro.ref, registro.slug, situacao);
}

export function listarParaPainel(): ResumoPainel[] {
  return listarResumos();
}

export function registroParaFormulario(id: string): RegistroImovel {
  const registro = buscarRegistro(id);
  if (!registro) throw new ImovelNaoEncontradoError();
  return registro;
}
