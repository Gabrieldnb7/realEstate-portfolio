// Páginas do painel: lista e formulário. O formulário envia urlencoded e recebe 302 depois
// de gravar, então funciona com JavaScript desligado; as validações são as mesmas da API.
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { DominioInvalidoError } from '../../entities/index.js';
import type { ErroCampo, Tipologia } from '../../entities/index.js';
import { errosPorCampo, mensagemDoCampo } from '../../utils/mensagens.campos.js';
import {
  ImovelNaoEncontradoError,
  atualizarImovelNoCatalogo,
  criarImovelNoCatalogo,
  listarParaPainel,
  mudarSituacaoDoImovel,
  registroParaFormulario,
} from './imoveis.servico.js';
import type { RegistroImovel } from '../../repositories/imoveis/imovel.repositorio.js';

const TIPOLOGIAS: Tipologia[] = ['apartamento', 'penthouse', 'villa', 'estate'];

const MENSAGENS_FEEDBACK: Record<string, string> = {
  salvo: 'Dados gravados.',
  situacao: 'Situação atualizada.',
};

function corpoDaRequisicao(request: FastifyRequest): Record<string, unknown> {
  return typeof request.body === 'object' && request.body !== null
    ? (request.body as Record<string, unknown>)
    : {};
}

function texto(bruto: unknown): string {
  if (typeof bruto === 'string') return bruto;
  if (typeof bruto === 'number') return String(bruto);
  return '';
}

function tipologiaDoPedido(request: FastifyRequest): Tipologia {
  return tipologiaDoPedidoOpcional(request) ?? 'apartamento';
}

function tipologiaDoPedidoOpcional(request: FastifyRequest): Tipologia | null {
  const query = request.query as Record<string, unknown>;
  const valor = texto(query['tipologia']);
  return TIPOLOGIAS.includes(valor as Tipologia) ? (valor as Tipologia) : null;
}

/** O formulário manda preço em dois campos; o serviço espera o objeto { valor, moeda }. */
function fichaDoFormulario(bruto: Record<string, unknown>): Record<string, unknown> {
  const { preco_valor: valorBruto, preco_moeda: moedaBruta, ...demais } = bruto;
  const valor = texto(valorBruto).trim();
  const moeda = texto(moedaBruta).trim();

  return {
    ...demais,
    preco: valor === '' && moeda === '' ? null : { valor, moeda },
  };
}

function valoresDoRegistro(registro: RegistroImovel): Record<string, string> {
  return {
    ref: registro.ref,
    titulo: registro.titulo,
    pais: registro.pais,
    cidade: registro.cidade,
    bairro: registro.bairro,
    descricao: registro.descricao,
    parceiro: registro.parceiro,
    quartos: String(registro.quartos),
    banheiros: registro.banheiros === null ? '' : String(registro.banheiros),
    vagas: registro.vagas === null ? '' : String(registro.vagas),
    andar: registro.andar === null ? '' : String(registro.andar),
    areaPrivativa: registro.areaPrivativa ?? '',
    areaConstruida: registro.areaConstruida ?? '',
    areaTerreno: registro.areaTerreno ?? '',
    preco_valor: registro.preco?.valor ?? '',
    preco_moeda: registro.preco?.moeda ?? '',
  };
}

function valoresDoCorpo(bruto: Record<string, unknown>): Record<string, string> {
  const saida: Record<string, string> = {};
  for (const [chave, valor] of Object.entries(bruto)) {
    saida[chave] = texto(valor);
  }
  return saida;
}

function valoresIniciais(tipologia: Tipologia): Record<string, string> {
  return {
    ref: '',
    titulo: '',
    pais: 'BR',
    cidade: '',
    bairro: '',
    descricao: '',
    parceiro: '',
    tipologia,
    quartos: '',
    banheiros: '',
    vagas: '',
    andar: '',
    areaPrivativa: '',
    areaConstruida: '',
    areaTerreno: '',
    preco_valor: '',
    preco_moeda: 'BRL',
  };
}

/**
 * Campos que o template já mostra ao lado do input. Qualquer outro código devolvido pelo
 * domínio (preco, tipologia, imagens) vai para o resumo no topo do formulário, para que
 * nenhum erro deixe de aparecer para quem usa o painel.
 */
const CAMPOS_COM_ESPACO_NO_FORMULARIO = new Set([
  'ref',
  'titulo',
  'pais',
  'cidade',
  'bairro',
  'descricao',
  'parceiro',
  'quartos',
  'banheiros',
  'vagas',
  'areaPrivativa',
  'areaConstruida',
  'areaTerreno',
  'andar',
  'preco.valor',
  'preco.moeda',
]);

function errosDeResumo(erros: ErroCampo[]): { campo: string; mensagem: string }[] {
  return erros
    .filter((erro) => !CAMPOS_COM_ESPACO_NO_FORMULARIO.has(erro.campo))
    .map((erro) => ({ campo: erro.campo, mensagem: mensagemDoCampo(erro) }));
}

function contextoFormulario(opcoes: {
  tipologia: Tipologia;
  valores: Record<string, string>;
  erros?: Record<string, string>;
  errosRestantes?: { campo: string; mensagem: string }[];
  registro?: RegistroImovel;
  acao: string;
  nomeUsuario: string;
  titulo?: string;
}) {
  const { registro } = opcoes;

  return {
    titulo: opcoes.titulo ?? (registro ? `Editar ${registro.ref}` : 'Novo imóvel'),
    acao: opcoes.acao,
    tipologia: opcoes.tipologia,
    tipologias: TIPOLOGIAS,
    valores: { ...valoresIniciais(opcoes.tipologia), ...(registro ? valoresDoRegistro(registro) : opcoes.valores) },
    erros: opcoes.erros ?? {},
    errosRestantes: opcoes.errosRestantes ?? [],
    imovel: registro
      ? {
          id: registro.id,
          ref: registro.ref,
          slug: registro.slug,
          situacao: registro.situacao,
          totalFotos: registro.imagens.length,
        }
      : null,
    nomeUsuario: opcoes.nomeUsuario,
  };
}

function falhaDoFormulario(
  reply: FastifyReply,
  erro: unknown,
  request: FastifyRequest,
  contexto: { acao: string; nomeUsuario: string; tipologia: Tipologia; titulo?: string }
): FastifyReply {
  if (erro instanceof DominioInvalidoError) {
    return reply
      .status(422)
      .view('admin/imovel-form.eta', {
        ...contextoFormulario({
          tipologia: contexto.tipologia,
          valores: valoresDoCorpo(corpoDaRequisicao(request)),
          erros: errosPorCampo(erro.campos),
          errosRestantes: errosDeResumo(erro.campos),
          acao: contexto.acao,
          nomeUsuario: contexto.nomeUsuario,
          ...(contexto.titulo ? { titulo: contexto.titulo } : {}),
        }),
      });
  }

  if (erro instanceof ImovelNaoEncontradoError) {
    return reply.status(404).type('text/plain').send('imovel_nao_encontrado');
  }

  request.log.error({ err: erro }, 'falha inesperada no formulário do painel');
  return reply.status(500).type('text/plain').send('falha_interna');
}

function nomeQuemUsa(request: FastifyRequest): string {
  return request.usuarioLogado?.nome ?? 'Equipe';
}

export async function rotasPainel(app: FastifyInstance): Promise<void> {
  app.get('/admin', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as Record<string, unknown>;
    const chaveFeedback = texto(query['feito']);
    const chaveErro = texto(query['erro']);

    return reply.view('admin/imoveis-lista.eta', {
      resumos: listarParaPainel(),
      feedback: MENSAGENS_FEEDBACK[chaveFeedback] ?? null,
      erro: chaveErro ? mensagemDoCampo({ campo: 'situacao', codigo: chaveErro }) : null,
      nomeUsuario: nomeQuemUsa(request),
    });
  });

  app.get('/admin/imoveis/novo', async (request: FastifyRequest, reply: FastifyReply) => {
    return reply.view('admin/imovel-form.eta', {
      ...contextoFormulario({
        tipologia: tipologiaDoPedido(request),
        valores: {},
        acao: '/admin/imoveis/novo',
        nomeUsuario: nomeQuemUsa(request),
      }),
    });
  });

  app.post('/admin/imoveis/novo', async (request: FastifyRequest, reply: FastifyReply) => {
    const bruto = corpoDaRequisicao(request);
    const tipologia = (TIPOLOGIAS.includes(texto(bruto['tipologia']) as Tipologia)
      ? (texto(bruto['tipologia']) as Tipologia)
      : 'apartamento') as Tipologia;

    try {
      const criado = criarImovelNoCatalogo(fichaDoFormulario(bruto));
      return reply.redirect(`/admin/imoveis/${criado.id}/editar?feito=salvo`, 302);
    } catch (erro) {
      return falhaDoFormulario(reply, erro, request, {
        acao: '/admin/imoveis/novo',
        nomeUsuario: nomeQuemUsa(request),
        tipologia,
      });
    }
  });

  app.get('/admin/imoveis/:id/editar', async (request: FastifyRequest, reply: FastifyReply) => {
    const id = (request.params as { id?: string }).id ?? '';

    try {
      const registro = registroParaFormulario(id);
      const query = request.query as Record<string, unknown>;

      return reply.view('admin/imovel-form.eta', {
        ...contextoFormulario({
          // O link de tipologia também funciona na edição: mostra os campos do tipo escolhido
          // com os dados salvos, e o próximo POST grava a troca.
          tipologia: tipologiaDoPedidoOpcional(request) ?? registro.tipologia,
          valores: {},
          registro,
          acao: `/admin/imoveis/${id}/editar`,
          nomeUsuario: nomeQuemUsa(request),
        }),
        feedback: MENSAGENS_FEEDBACK[texto(query['feito'])] ?? null,
      });
    } catch (erro) {
      return falhaDoFormulario(reply, erro, request, {
        acao: `/admin/imoveis/${id}/editar`,
        nomeUsuario: nomeQuemUsa(request),
        tipologia: tipologiaDoPedido(request),
      });
    }
  });

  app.post('/admin/imoveis/:id/editar', async (request: FastifyRequest, reply: FastifyReply) => {
    const id = (request.params as { id?: string }).id ?? '';
    const bruto = corpoDaRequisicao(request);
    const tipologia = (TIPOLOGIAS.includes(texto(bruto['tipologia']) as Tipologia)
      ? (texto(bruto['tipologia']) as Tipologia)
      : 'apartamento') as Tipologia;

    try {
      atualizarImovelNoCatalogo(id, fichaDoFormulario(bruto));
      return reply.redirect(`/admin/imoveis/${id}/editar?feito=salvo`, 302);
    } catch (erro) {
      return falhaDoFormulario(reply, erro, request, {
        acao: `/admin/imoveis/${id}/editar`,
        nomeUsuario: nomeQuemUsa(request),
        tipologia,
        titulo: `Editar ${texto(bruto['ref']) || id}`,
      });
    }
  });

  app.post('/admin/imoveis/:id/situacao', async (request: FastifyRequest, reply: FastifyReply) => {
    const id = (request.params as { id?: string }).id ?? '';
    const bruto = corpoDaRequisicao(request);

    try {
      mudarSituacaoDoImovel(id, { situacao: texto(bruto['situacao']) });
      return reply.redirect('/admin?feito=situacao', 302);
    } catch (erro) {
      if (erro instanceof DominioInvalidoError) {
        const motivo = erro.campos[0]?.codigo ?? 'invalida';
        return reply.redirect(`/admin?erro=${encodeURIComponent(motivo)}`, 302);
      }
      if (erro instanceof ImovelNaoEncontradoError) {
        return reply.status(404).type('text/plain').send('imovel_nao_encontrado');
      }
      request.log.error({ err: erro }, 'falha inesperada ao mudar situação');
      return reply.status(500).type('text/plain').send('falha_interna');
    }
  });
}
