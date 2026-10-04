import fastifyView from '@fastify/view';
import Fastify from 'fastify';
import path from 'node:path';
import cors from '@fastify/cors';
import { saudeRoutes } from './routes/saude.js';
import { Eta } from 'eta';

export async function buildApp() {
  const app = Fastify({ logger: true });
  const eta = new Eta({ views: path.join(__dirname, 'views') });
  app.register(fastifyView, {
    engine: {eta: eta}
  });

  app.register(cors, {
    origin: '*', 
  });

  app.register(saudeRoutes);
  
  return app;
}
