import { DominioInvalidoError } from '../../entities/index.js';
import type { ErroCampo } from '../../entities/index.js';
import { buscarTexto, salvarTexto } from '../../repositories/textos/texto.repositorio.js';
import type { CamposTexto, ChaveTexto } from '../../repositories/textos/texto.repositorio.js';

export const PAGINAS_COM_TEXTO: readonly ChaveTexto[] = ['inicio', 'rodape'];

// Anexo D, seção 5: estes são os campos mínimos de cada página
const CAMPO_MINIMO: Record<ChaveTexto, string> = {
  inicio: 'titulo',
  rodape: 'texto',
};

const LIMITE_CARACTERES_POR_CAMPO = 500;

// Campo mínimo ausente ou em branco: o contrato do painel responde 400 (issue 8). 
export class CampoObrigatorioAusenteError extends Error {
  public readonly campos: ErroCampo[];

  constructor(campos: ErroCampo[]) {
    super('campos_obrigatorios');
    this.name = 'CampoObrigatorioAusenteError';
    this.campos = campos;
  }
}

// Página que não tem texto editável: só inicio e rodape existem no contrato. 
export class PaginaNaoEditavelError extends Error {
  constructor() {
    super('pagina_nao_editavel');
    this.name = 'PaginaNaoEditavelError';
  }
}

export interface TextoDaPagina {
  pagina: ChaveTexto;
  campos: CamposTexto;
  atualizadoEm: string;
}

export function paginaValida(pagina: string): ChaveTexto {
  if (!PAGINAS_COM_TEXTO.includes(pagina as ChaveTexto)) {
    throw new PaginaNaoEditavelError();
  }
  return pagina as ChaveTexto;
}

function camposDoCorpo(corpo: unknown): Record<string, unknown> {
  if (typeof corpo !== 'object' || corpo === null || Array.isArray(corpo)) {
    throw new CampoObrigatorioAusenteError([{ campo: 'corpo', codigo: 'invalido' }]);
  }

  const bruto = (corpo as Record<string, unknown>)['campos'];
  if (typeof bruto !== 'object' || bruto === null || Array.isArray(bruto)) {
    throw new CampoObrigatorioAusenteError([{ campo: 'campos', codigo: 'obrigatorio' }]);
  }

  return bruto as Record<string, unknown>;
}

/**
 * O que chega substitui o texto salvo por inteiro, então campo vazio não é "mantém o anterior":
 * é campo que deixa de existir. Os valores livres da Início passam sem checagem de nome.
 */
function validarCampos(chave: ChaveTexto, bruto: Record<string, unknown>): CamposTexto {
  const ausentes: ErroCampo[] = [];
  const invalidos: ErroCampo[] = [];
  const limpos: CamposTexto = {};

  const minimo = CAMPO_MINIMO[chave];
  if (!Object.prototype.hasOwnProperty.call(bruto, minimo)) {
    ausentes.push({ campo: minimo, codigo: 'obrigatorio' });
  }

  for (const [campo, valor] of Object.entries(bruto)) {
    if (typeof valor !== 'string') {
      invalidos.push({ campo, codigo: 'texto_invalido' });
      continue;
    }

    const texto = valor.trim();

    if (texto.length > LIMITE_CARACTERES_POR_CAMPO) {
      invalidos.push({ campo, codigo: 'maximo_excedido' });
      continue;
    }

    if (texto === '') {
      if (campo === minimo) ausentes.push({ campo, codigo: 'obrigatorio' });
      continue;
    }

    limpos[campo] = texto;
  }

  if (ausentes.length > 0) throw new CampoObrigatorioAusenteError(ausentes);
  if (invalidos.length > 0) throw new DominioInvalidoError('dados_invalidos', invalidos);

  return limpos;
}

export function textoDaPagina(pagina: string): TextoDaPagina {
  const chave = paginaValida(pagina);
  const registro = buscarTexto(chave);

  return {
    pagina: chave,
    campos: registro?.campos ?? {},
    atualizadoEm: registro?.atualizadoEm ?? '',
  };
}

export function salvarTextoDaPagina(pagina: string, corpo: unknown): TextoDaPagina {
  const chave = paginaValida(pagina);
  const campos = validarCampos(chave, camposDoCorpo(corpo));
  const atualizadoEm = new Date().toISOString();

  salvarTexto(chave, campos, atualizadoEm);

  return { pagina: chave, campos, atualizadoEm };
}
