import { buildApp } from './app.js';
import { carregarConfig, ConfiguraçãoInvalidaError } from './config/ambiente.js';

async function start(): Promise<void> {
  try {
    const config = carregarConfig();
    const app = await buildApp();
    await app.listen({ port: config.porta, host: '0.0.0.0' });
  } catch (erro) {
    if (erro instanceof ConfiguraçãoInvalidaError) {
      console.error(`[config] ${erro.message}`);
    } else {
      console.error(erro);
    }
    process.exit(1);
  }
}

start();
