// Ficha pública do imóvel (Anexo D, seção 5). O que não vai ao ar é decidido aqui: rascunho e
// arquivado não existem para quem visita o site, mesmo com a slug certa.
import {
  areaBaseParaPrecoPorM2,
  calcularPrecoPorM2,
  SITUACOES_VISIVEIS_NO_SITE,
} from '../entities/index.js';
import type { Praca, PrecoVo, SituacaoImovel, Tipologia } from '../entities/index.js';
import { buscarRegistroPorSlug } from '../repositories/imoveis/imovel.repositorio.js';

export interface FichaPublica {
  ref: string;
  slug: string;
  titulo: string;
  tipologia: Tipologia;
  situacao: SituacaoImovel;
  pais: Praca;
  cidade: string;
  bairro: string;
  descricao: string;
  preco: PrecoVo | null;
  areaPrivativa: string | null;
  areaConstruida: string | null;
  areaTerreno: string | null;
  quartos: number;
  banheiros: number | null;
  vagas: number | null;
  andar: number | null;
  precoPorM2: PrecoVo | null;
  imagens: { url: string; alt: string }[];
  whatsappUrl: string | null;
}

// A mensagem identifica o imóvel pela referência, que é o código que a equipe usa.
export function urlDeWhatsApp(numeroE164: string | null, ref: string): string | null {
  if (numeroE164 === null) return null;

  const mensagem = new URLSearchParams({ text: `Olá, tenho interesse no imóvel ${ref}` });
  return `https://wa.me/${numeroE164.slice(1)}?${mensagem.toString()}`;
}

export function fichaPublica(slug: string, numeroE164: string | null): FichaPublica | null {
  const registro = buscarRegistroPorSlug(slug);
  if (registro === null) return null;
  if (!SITUACOES_VISIVEIS_NO_SITE.includes(registro.situacao)) return null;

  return {
    ref: registro.ref,
    slug: registro.slug,
    titulo: registro.titulo,
    tipologia: registro.tipologia,
    situacao: registro.situacao,
    pais: registro.pais,
    cidade: registro.cidade,
    bairro: registro.bairro,
    descricao: registro.descricao,
    preco: registro.preco,
    areaPrivativa: registro.areaPrivativa,
    areaConstruida: registro.areaConstruida,
    areaTerreno: registro.areaTerreno,
    quartos: registro.quartos,
    banheiros: registro.banheiros,
    vagas: registro.vagas,
    andar: registro.andar,
    precoPorM2: calcularPrecoPorM2(
      registro.preco,
      areaBaseParaPrecoPorM2(registro.tipologia, registro)
    ),
    imagens: registro.imagens.map((imagem) => ({ url: imagem.url, alt: imagem.alt })),
    // Anexo C: imóvel vendido não tem botão de WhatsApp.
    whatsappUrl:
      registro.situacao === 'vendido' ? null : urlDeWhatsApp(numeroE164, registro.ref),
  };
}
