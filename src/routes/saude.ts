import type { FastifyInstance } from 'fastify'

export async function saudeRoutes(fastify: FastifyInstance) {
  fastify.get('/saude', async (request, reply) => {
    return { ok: true }
  })
}
