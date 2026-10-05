// Página e API da ficha do imóvel (Anexo D, seções 4 e 5). O que aparece é decisão do catálogo:
// rascunho e arquivado respondem 404, e vendido não mostra o botão de WhatsApp.
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { carregarConfig } from '../config/ambiente.js';
import { areaBaseParaPrecoPorM2 } from '../entities/index.js';
import type { FichaPublica } from '../services/ficha.servico.js';
import { fichaPublica } from '../services/ficha.servico.js';
import { seloDaSituacao } from '../utils/cartoes.site.js';
import { areaParaTela, precoParaTela } from '../utils/formatar.valores.js';
import { baseDaPaginaPublica } from './site.js';

interface Linha {
  rotulo: string;
  valor: string;
}

function especificacoesDaFicha(ficha: FichaPublica): Linha[] {
  const linhas: Linha[] = [];

  const adicionar = (rotulo: string, valor: string | null): void => {
    if (valor !== null) linhas.push({ rotulo, valor });
  };

  adicionar('Quartos', String(ficha.quartos));
  adicionar('Banheiros', ficha.banheiros === null ? null : String(ficha.banheiros));
  adicionar('Vagas', ficha.vagas === null ? null : String(ficha.vagas));
  adicionar('Andar', ficha.andar === null ? null : String(ficha.andar));
  adicionar('Área privativa', areaParaTela(ficha.areaPrivativa));
  adicionar('Área construída', areaParaTela(ficha.areaConstruida));
  adicionar('Área do terreno', areaParaTela(ficha.areaTerreno));

  return linhas;
}

function contextoDaPagina(ficha: FichaPublica) {
  const areaBase = areaBaseParaPrecoPorM2(ficha.tipologia, ficha);

  return {
    ...baseDaPaginaPublica(ficha.titulo),
    ref: ficha.ref,
    titulo: ficha.titulo,
    local: `${ficha.cidade}, ${ficha.bairro}`,
    descricao: ficha.descricao,
    situacao: ficha.situacao,
    selo: seloDaSituacao(ficha.situacao),
    preco: precoParaTela(ficha.preco),
    precoPorM2: precoParaTela(ficha.precoPorM2),
    areaBase: areaParaTela(areaBase),
    especificacoes: especificacoesDaFicha(ficha),
    imagens: ficha.imagens,
    whatsappUrl: ficha.whatsappUrl,
  };
}

function slugDaRota(request: FastifyRequest): string {
  return (request.params as { slug?: string }).slug ?? '';
}

export async function rotasDetalhe(app: FastifyInstance): Promise<void> {
  const config = carregarConfig();

  app.get(
    '/api/v1/imoveis/:slug',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const ficha = fichaPublica(slugDaRota(request), config.whatsappE164);
      if (ficha === null) {
        return reply.status(404).send({ erro: 'imovel_nao_encontrado' });
      }

      return reply.status(200).send(ficha);
    }
  );

  app.get('/imoveis/:slug', async (request: FastifyRequest, reply: FastifyReply) => {
    const ficha = fichaPublica(slugDaRota(request), config.whatsappE164);
    if (ficha === null) {
      return reply
        .status(404)
        .view('site/nao-encontrado.eta', baseDaPaginaPublica('Não encontrado'), {
          layout: 'site/layout.eta',
        });
    }

    return reply.view('site/imovel-detalhe.eta', contextoDaPagina(ficha), {
      layout: 'site/layout.eta',
    });
  });
}
