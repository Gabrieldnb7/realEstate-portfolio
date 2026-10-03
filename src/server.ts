import { buildApp } from './app.js';

async function start() {
  const app = await buildApp();

  try {
    await app.listen({ port: 3000, host: '0.0.0.0' });
    console.log('🚀 Servidor rodando na porta 3000');
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
