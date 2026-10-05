import { conectarBanco } from '../../infra/db.js';

export type ChaveTexto = 'inicio' | 'rodape';

export type CamposTexto = Record<string, string>;

export interface RegistroTexto {
  chave: ChaveTexto;
  campos: CamposTexto;
  atualizadoEm: string;
}

interface LinhaTexto {
  chave: string;
  conteudo_json: string;
  atualizado_em: string;
}

// A linha é lida com desconfiança: JSON quebrado ou valor que não é texto não derrubam a página.
function camposDoConteudo(bruto: string): CamposTexto {
  let parseado: unknown;
  try {
    parseado = JSON.parse(bruto);
  } catch {
    return {};
  }

  if (typeof parseado !== 'object' || parseado === null || Array.isArray(parseado)) return {};

  const campos: CamposTexto = {};
  for (const [campo, valor] of Object.entries(parseado as Record<string, unknown>)) {
    if (typeof valor === 'string') campos[campo] = valor;
  }
  return campos;
}

export function buscarTexto(chave: ChaveTexto): RegistroTexto | null {
  const linha = conectarBanco()
    .prepare('SELECT chave, conteudo_json, atualizado_em FROM textos_site WHERE chave = ?')
    .get(chave) as LinhaTexto | undefined;

  if (!linha) return null;

  return {
    chave: linha.chave as ChaveTexto,
    campos: camposDoConteudo(linha.conteudo_json),
    atualizadoEm: linha.atualizado_em,
  };
}

export function salvarTexto(chave: ChaveTexto, campos: CamposTexto, atualizadoEm: string): void {
  conectarBanco()
    .prepare('INSERT OR REPLACE INTO textos_site (chave, conteudo_json, atualizado_em) VALUES (?, ?, ?)')
    .run(chave, JSON.stringify(campos), atualizadoEm);
}
