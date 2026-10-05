import { createHash, randomBytes } from 'node:crypto';
import type { ConfigApp } from '../../config/ambiente.js';
import { conectarBanco } from '../../infra/db.js';
import { verificarSenha, verificarSenhaSemUsuario } from '../../repositories/seguranca/senhas.js';

export const ERRO_CREDENCIAIS_INVALIDAS = 'credenciais_invalidas';
export const ERRO_NAO_AUTENTICADO = 'nao_autenticado';

export interface UsuarioSessao {
  id: string;
  nome: string;
}

export interface ResultadoLogin {
  token: string;
  usuario: UsuarioSessao;
  expiraEm: Date;
}

export class CredenciaisInvalidasError extends Error {
  constructor() {
    super(ERRO_CREDENCIAIS_INVALIDAS);
    this.name = 'CredenciaisInvalidasError';
  }
}

export function normalizarEmail(email: string): string {
  return email.trim().toLowerCase();
}

// O cookie carrega um token aleatório; a tabela sessoes guarda apenas o SHA-256.
export function chaveDaSessao(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

interface LinhaUsuario {
  id: string;
  nome: string;
  senha_hash: string;
}

export async function fazerLogin(
  email: string,
  senha: string,
  config: Pick<ConfigApp, 'ttlSessaoSegundos'>
): Promise<ResultadoLogin> {
  const db = conectarBanco();

  const usuario = db
    .prepare('SELECT id, nome, senha_hash FROM usuarios WHERE email = ?')
    .get(normalizarEmail(email)) as LinhaUsuario | undefined;

  if (!usuario) {
    // Caminho com o mesmo custo de verificação do caso em que o usuário existe.
    await verificarSenhaSemUsuario(senha);
    throw new CredenciaisInvalidasError();
  }

  const senhaOk = await verificarSenha(usuario.senha_hash, senha);
  if (!senhaOk) {
    throw new CredenciaisInvalidasError();
  }

  const token = randomBytes(32).toString('base64url');
  const agora = new Date();
  const expiraEm = new Date(agora.getTime() + config.ttlSessaoSegundos * 1000);

  db.prepare('DELETE FROM sessoes WHERE expira_em < ?').run(agora.toISOString());
  db.prepare('INSERT INTO sessoes (id, usuario_id, expira_em, criado_em) VALUES (?, ?, ?, ?)').run(
    chaveDaSessao(token),
    usuario.id,
    expiraEm.toISOString(),
    agora.toISOString()
  );

  return { token, usuario: { id: usuario.id, nome: usuario.nome }, expiraEm };
}

export function fazerLogout(token: string): void {
  conectarBanco().prepare('DELETE FROM sessoes WHERE id = ?').run(chaveDaSessao(token));
}

export function validarSessao(token: string): UsuarioSessao | null {
  const db = conectarBanco();

  const sessao = db
    .prepare(
      `SELECT s.expira_em, u.id AS usuario_id, u.nome
       FROM sessoes s
       JOIN usuarios u ON u.id = s.usuario_id
       WHERE s.id = ?`
    )
    .get(chaveDaSessao(token)) as
    | { expira_em: string; usuario_id: string; nome: string }
    | undefined;

  if (!sessao) return null;

  if (new Date(sessao.expira_em).getTime() <= Date.now()) {
    fazerLogout(token);
    return null;
  }

  return { id: sessao.usuario_id, nome: sessao.nome };
}
