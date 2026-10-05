// Listagem pública: a API JSON conforme o contrato e a página de catálogo com filtros na URL.
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Praca } from '../entities/index.js';
import {
  interpretarParametros,
  listarImoveisDoSite,
  ORDENACOES_VALIDAS,
  PARAMETROS_PADRAO,
} from '../services/catalogo.servico.js';
import type { ParametrosCatalogo } from '../services/catalogo.servico.js';
import { cartoesDoSite } from '../utils/cartoes.site.js';
import { AVISO_DE_PROJETO, textoDoRodape } from './site.js';

const NOMES_DAS_PRACAS: Record<Praca, string> = {
  BR: 'Brasil',
  PA: 'Panamá',
  AE: 'Emirados Árabes Unidos',
};

const NOMES_DA_ORDEM: Record<ParametrosCatalogo['ordenar'], string> = {
  recentes: 'Mais recentes',
  preco_asc: 'Menor preço',
  preco_desc: 'Maior preço',
};

interface OpcaoDeFiltro {
  rotulo: string;
  url: string;
  ativa: boolean;
}

// O link carrega a escolha do visitante e mantém a outra escolha já feita.
function urlDoCatalogo(atual: ParametrosCatalogo, muda: Partial<ParametrosCatalogo>): string {
  const pais = muda.pais === undefined ? atual.pais : muda.pais;
  const ordenar = muda.ordenar ?? atual.ordenar;

  const parametros = new URLSearchParams();
  if (pais) parametros.set('pais', pais);
  if (ordenar !== PARAMETROS_PADRAO.ordenar) parametros.set('ordenar', ordenar);

  const consulta = parametros.toString();
  return `/imoveis${consulta ? `?${consulta}` : ''}`;
}

function opcoesDeFiltro(atual: ParametrosCatalogo) {
  const todas: OpcaoDeFiltro = {
    rotulo: 'Todas as praças',
    url: urlDoCatalogo(atual, { pais: null }),
    ativa: atual.pais === null,
  };

  const pracas: OpcaoDeFiltro[] = [todas];
  for (const pais of Object.keys(NOMES_DAS_PRACAS) as Praca[]) {
    pracas.push({
      rotulo: NOMES_DAS_PRACAS[pais],
      url: urlDoCatalogo(atual, { pais }),
      ativa: atual.pais === pais,
    });
  }

  const ordens: OpcaoDeFiltro[] = ORDENACOES_VALIDAS.map((ordenar) => ({
    rotulo: NOMES_DA_ORDEM[ordenar],
    url: urlDoCatalogo(atual, { ordenar }),
    ativa: atual.ordenar === ordenar,
  }));

  return { pracas, ordens };
}

export async function rotasCatalogo(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/imoveis', async (request: FastifyRequest, reply: FastifyReply) => {
    const filtros = interpretarParametros(request.query as Record<string, unknown>);
    if (filtros === null) {
      return reply.status(400).send({ erro: 'parametro_invalido' });
    }

    return reply.status(200).send(listarImoveisDoSite(filtros));
  });

  app.get('/imoveis', async (request: FastifyRequest, reply: FastifyReply) => {
    // Página não quebra por parâmetro torto: volta ao padrão e mostra o catálogo inteiro.
    const filtros =
      interpretarParametros(request.query as Record<string, unknown>) ?? PARAMETROS_PADRAO;
    const listagem = listarImoveisDoSite(filtros);
    const total = listagem.total;

    return reply.view(
      'site/catalogo.eta',
      {
        tituloPagina: 'Imóveis',
        rodape: textoDoRodape(),
        aviso: AVISO_DE_PROJETO,
        filtros: opcoesDeFiltro(filtros),
        rotuloTotal: `${total} ${total === 1 ? 'imóvel' : 'imóveis'} nesta seleção.`,
        cartoes: cartoesDoSite(listagem.itens),
        urlCatalogoInteiro: urlDoCatalogo(filtros, {
          pais: null,
          ordenar: PARAMETROS_PADRAO.ordenar,
        }),
      },
      { layout: 'site/layout.eta' }
    );
  });
}
