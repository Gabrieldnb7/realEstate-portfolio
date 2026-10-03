import Fastify from 'fastify';
import cors from '@fastify/cors';
import { saudeRoutes } from './routes/saude.js';

export async function buildApp() {
  const app = Fastify({ logger: true });
  
  app.register(cors, {
    origin: '*', 
  });

  app.register(saudeRoutes);
  return app;
}
