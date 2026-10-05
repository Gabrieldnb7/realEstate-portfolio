import { hash, verify } from '@node-rs/argon2';
import type { Options } from '@node-rs/argon2';

const PARAMETROS: Options = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
};

export async function criarHashSenha(senha: string): Promise<string> {
  return hash(senha, PARAMETROS);
}

export async function verificarSenha(senhaHash: string, senha: string): Promise<boolean> {
  if (senhaHash.length === 0) return false;
  return verify(senhaHash, senha, PARAMETROS).catch(() => false);
}

let hashReserva: Promise<string> | null = null;

async function obterHashReserva(): Promise<string> {
  if (!hashReserva) {
    hashReserva = criarHashSenha('senha-ficticia-anti-enumeracao');
  }
  return hashReserva;
}

export async function verificarSenhaSemUsuario(senha: string): Promise<void> {
  await verificarSenha(await obterHashReserva(), senha);
}
