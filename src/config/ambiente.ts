import { existsSync } from 'node:fs';

let envCarregado = false;

function carregarArquivoEnv(): void {
  if (envCarregado) return;
  envCarregado = true;
  if (!existsSync('.env')) return;
  try {
    process.loadEnvFile('.env');
  } catch {
    // Ambiente sem suporte ou .env ilegível: segue só com as variáveis do processo.
  }
}

function lerTexto(nome: string, padrao = ''): string {
  return (process.env[nome] ?? padrao).trim();
}

const TAMANHO_MINIMO_SEGREDO = 32;
const TETO_TTL_SEGUNDOS = 60 * 60 * 24 * 30;

export type Ambiente = 'development' | 'test' | 'production';

export interface ConfigApp {
  ambiente: Ambiente;
  porta: number;
  segredoApp: string;
  ttlSessaoSegundos: number;
  cookieSeguro: boolean;
  whatsappE164: string | null;
}

export class ConfiguraçãoInvalidaError extends Error {}

function lerAmbiente(): Ambiente {
  const valor = lerTexto('NODE_ENV', 'development');
  return valor === 'production' || valor === 'test' ? valor : 'development';
}

function lerSegredoApp(ambiente: Ambiente): string {
  const segredo = lerTexto('SEGREDO_APP');
  if (segredo.length < TAMANHO_MINIMO_SEGREDO) {
    throw new ConfiguraçãoInvalidaError(
      `SEGREDO_APP deve ter pelo menos ${TAMANHO_MINIMO_SEGREDO} caracteres (ambiente: ${ambiente}). ` +
        'Defina no ambiente do processo ou no .env local; nunca commite o valor.'
    );
  }
  return segredo;
}

function lerTtlSessao(): number {
  const ttl = Number.parseInt(lerTexto('SESSAO_TTL_SEGUNDOS', '86400'), 10);
  if (!Number.isInteger(ttl) || ttl <= 0 || ttl > TETO_TTL_SEGUNDOS) {
    throw new ConfiguraçãoInvalidaError(
      `SESSAO_TTL_SEGUNDOS deve ser um inteiro entre 1 e ${TETO_TTL_SEGUNDOS}.`
    );
  }
  return ttl;
}

function lerPorta(): number {
  const porta = Number.parseInt(lerTexto('PORT', '3000'), 10);
  if (!Number.isInteger(porta) || porta <= 0 || porta > 65535) {
    throw new ConfiguraçãoInvalidaError('PORT deve ser um número de porta válido.');
  }
  return porta;
}

// WHATSAPP_E164 chega como +5511999999999. Sem número válido injetado, o site não mostra o botão;
// o link nunca é montado com um número quebrado.
const DIGITOS_MINIMOS_E164 = 10;
const DIGITOS_MAXIMOS_E164 = 15;

function lerWhatsappE164(): string | null {
  const bruto = lerTexto('WHATSAPP_E164');
  if (bruto === '') return null;

  const digitos = bruto.replace(/\D/g, '');
  if (digitos.length < DIGITOS_MINIMOS_E164 || digitos.length > DIGITOS_MAXIMOS_E164) return null;
  return `+${digitos}`;
}

export function carregarConfig(): ConfigApp {
  carregarArquivoEnv();

  const ambiente = lerAmbiente();
  const cookieSeguroConfigurado = lerTexto('COOKIE_SECURE').toLowerCase() === 'true';

  return {
    ambiente,
    porta: lerPorta(),
    segredoApp: lerSegredoApp(ambiente),
    ttlSessaoSegundos: lerTtlSessao(),
    // Em produção o cookie só trafega sobre HTTPS, independentemente do valor injetado.
    cookieSeguro: ambiente === 'production' || cookieSeguroConfigurado,
    whatsappE164: lerWhatsappE164(),
  };
}
