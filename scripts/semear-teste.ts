import { hash } from '@node-rs/argon2';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { conectarBanco, fecharBanco } from '../src/infra/db.js';
import { executarMigracoes } from './migrar.js';

// ─── Parser CSV robusto ───────────────────────────────────────────────
function parseLinhaCampos(linha: string): string[] {
  const campos: string[] = [];
  let buffer = '';
  let dentroAspas = false;
  let i = 0;

  while (i < linha.length) {
    const c = linha[i]!;

    if (dentroAspas) {
      if (c === '"') {
        // Aspas duplas escapadas dentro de campo: ""
        if (linha[i + 1] === '"') {
          buffer += '"';
          i += 2;
          continue;
        }
        // Fecha campo entre aspas
        dentroAspas = false;
        i++;
        continue;
      }
      buffer += c;
    } else {
      if (c === '"') {
        dentroAspas = true;
        i++;
        continue;
      }
      if (c === ',') {
        campos.push(buffer);
        buffer = '';
        i++;
        continue;
      }
      buffer += c;
    }
    i++;
  }
  campos.push(buffer);
  return campos;
}

function parseCsvLinhas(conteudo: string): Record<string, string>[] {
  // Normaliza quebras de linha
  const linhasRaw = conteudo.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  // Reconstrói linhas respeitando quebras de linha dentro de campos entre aspas
  const linhas: string[] = [];
  let acumulado = '';
  let dentroAspas = false;

  for (const parte of linhasRaw) {
    for (const c of parte) {
      if (c === '"') {
        dentroAspas = !dentroAspas;
      }
    }
    acumulado += (acumulado ? '\n' : '') + parte;
    if (!dentroAspas) {
      linhas.push(acumulado.trim());
      acumulado = '';
    }
  }
  if (acumulado.trim()) linhas.push(acumulado.trim());

  const linhasFiltradas = linhas.filter((l) => l.length > 0);
  if (linhasFiltradas.length === 0) return [];

  const headers = parseLinhaCampos(linhasFiltradas[0]!).map((h) => h.trim());
  const dados: Record<string, string>[] = [];

  for (let idx = 1; idx < linhasFiltradas.length; idx++) {
    const linha = linhasFiltradas[idx]!;
    if (!linha) continue;
    const campos = parseLinhaCampos(linha);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = (campos[i] ?? '').trim();
    });
    dados.push(obj);
  }

  return dados;
}
// ─────────────────────────────────────────────────────────────────────

function normalizarPreco(precoBruto: string, praca: string): { valor: string; moeda: string } | null {
  if (!precoBruto || precoBruto.toLowerCase().includes('consulta')) {
    return null;
  }

  const moeda = praca === 'PA' ? 'USD' : praca === 'AE' ? 'AED' : 'BRL';

  // Remove prefixos de moeda e espaços
  let limpo = precoBruto.replace(/R\$|US\$|AED\s*/i, '').trim();

  // Sufixo "M" = milhões (ex: "3.5M", "9.2M")
  if (/^\d+(\.\d+)?M$/i.test(limpo)) {
    const num = Number.parseFloat(limpo.replace(/M$/i, ''));
    return { valor: (num * 1_000_000).toFixed(2), moeda };
  }

  // Remove separadores de milhar dependendo do formato
  // Detecta se usa ponto como decimal (ex: "1,718.71") ou virgula (ex: "4.850.000,10")
  const temPonto = limpo.includes('.');
  const temVirgula = limpo.includes(',');

  if (temPonto && temVirgula) {
    if (limpo.indexOf('.') < limpo.lastIndexOf(',')) {
      // Ex: "4.850.000,10" -> ponto é milhar, virgula é decimal
      limpo = limpo.replace(/\./g, '').replace(',', '.');
    } else {
      // Ex: "1,250,000.00" -> vírgula é milhar, ponto é decimal
      limpo = limpo.replace(/,/g, '');
    }
  } else if (temVirgula && !temPonto) {
    // Pode ser milhar "1,250,000" ou decimal "4,10"
    const partesDec = limpo.split(',');
    if (partesDec.length > 1 && partesDec[partesDec.length - 1]!.length === 2) {
      // Decimal
      limpo = limpo.replace(/,/g, '');
      const idx = limpo.length - 2;
      limpo = limpo.slice(0, idx) + '.' + limpo.slice(idx);
    } else {
      // Separador de milhar
      limpo = limpo.replace(/,/g, '');
    }
  } else if (temPonto && !temVirgula) {
    // Podem ser múltiplos pontos de milhar "1.150" ou decimal "12400000.00"
    const partesPonto = limpo.split('.');
    if (partesPonto.length > 2 || (partesPonto.length === 2 && partesPonto[1]!.length === 3)) {
      // Ex: "3.150.000" ou "1.150" -> milhar
      limpo = limpo.replace(/\./g, '');
    }
    // Caso contrário já é decimal: "48000000.00"
  }

  const num = Number.parseFloat(limpo);
  if (Number.isNaN(num) || num < 0) return null;
  return { valor: num.toFixed(2), moeda };
}

function normalizarArea(areaBruta: string): string | null {
  if (!areaBruta || areaBruta.trim() === '') return null;

  let limpo = areaBruta.replace(/m2|m²|\s*/gi, '');

  const temPonto = limpo.includes('.');
  const temVirgula = limpo.includes(',');

  if (temPonto && temVirgula) {
    if (limpo.indexOf('.') < limpo.indexOf(',')) {
      // "1.100" -> milhar; mas "1,718.71" -> ponto é decimal
      limpo = limpo.replace(/,/g, '');
    } else {
      limpo = limpo.replace(/\./g, '').replace(',', '.');
    }
  } else if (temVirgula) {
    limpo = limpo.replace(',', '.');
  } else if (temPonto) {
    const partes = limpo.split('.');
    if (partes.length === 2 && partes[1]!.length === 3) {
      // "1.150" -> milhar
      limpo = limpo.replace('.', '');
    }
  }

  const num = Number.parseFloat(limpo);
  if (Number.isNaN(num) || num <= 0) return null;
  return num.toFixed(2);
}

function gerarSlug(ref: string, titulo: string): string {
  return `${ref}-${titulo}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[<>]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export async function semearBase(): Promise<void> {
  // 1. Garante migrações aplicadas
  executarMigracoes();

  const db = conectarBanco();

  // 2. Administrador inicial
  const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@realestate.example';
  const adminSenha = process.env.ADMIN_SENHA ?? 'AdminSeguro123!';

  const adminExiste = db.prepare('SELECT id FROM usuarios WHERE email = ?').get(adminEmail);
  if (!adminExiste) {
    const senhaHash = await hash(adminSenha);
    db.prepare(`
      INSERT INTO usuarios (id, nome, email, senha_hash, criado_em)
      VALUES (?, ?, ?, ?, ?)
    `).run(randomUUID(), 'Administrador', adminEmail, senhaHash, new Date().toISOString());
    console.log(`[seed] Administrador criado: ${adminEmail}`);
  } else {
    console.log(`[seed] Administrador já existe: ${adminEmail}`);
  }

  // 3. Preparação do diretório de uploads
  const uploadDir = resolve(process.env.UPLOAD_DIR ?? './uploads');
  mkdirSync(uploadDir, { recursive: true });

  // 4. Carrega índice de fotos (arquivo -> ref)
  const caminhoIndiceFotos = resolve('./imagens/indice-das-fotos.csv');
  const fotosPorRef = new Map<string, string[]>();

  if (existsSync(caminhoIndiceFotos)) {
    const linhasIndice = parseCsvLinhas(readFileSync(caminhoIndiceFotos, 'utf8'));
    for (const linha of linhasIndice) {
      const arq = linha['arquivo'];
      const ref = linha['ref'];
      if (arq && ref) {
        if (!fotosPorRef.has(ref)) fotosPorRef.set(ref, []);
        fotosPorRef.get(ref)!.push(arq);
      }
    }
  }

  // 5. Carrega planilha de imóveis
  const caminhoPlanilha = resolve('./dados/imoveis-exemplo.csv');
  if (!existsSync(caminhoPlanilha)) {
    console.warn('[seed] Planilha imoveis-exemplo.csv não encontrada.');
    return;
  }

  const registros = parseCsvLinhas(readFileSync(caminhoPlanilha, 'utf8'));

  const insertImovel = db.prepare(`
    INSERT OR REPLACE INTO imoveis (
      id, ref, slug, titulo, tipologia, pais, cidade, bairro, descricao,
      preco_valor, preco_moeda, area_privativa, area_construida, area_terreno,
      quartos, banheiros, vagas, andar, parceiro, situacao, criado_em, atualizado_em
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const deleteImagens = db.prepare('DELETE FROM imagens WHERE imovel_id = ?');
  const insertImagem = db.prepare(`
    INSERT INTO imagens (id, imovel_id, url, alt, ordem, criado_em)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const agora = new Date().toISOString();

  const seedTransacao = db.transaction(() => {
    for (const item of registros) {
      const ref = item['ref'] ?? '';
      const titulo = item['titulo'] ?? '';
      const praca = item['praca'] ?? '';
      const tipologia = item['tipologia'] ?? '';
      const situacao = item['situacao'] ?? 'rascunho';

      if (!ref || !titulo) continue;

      const precoObj = normalizarPreco(item['preco'] ?? '', praca);
      const areaNorm = normalizarArea(item['area'] ?? '');
      const terrenoNorm = normalizarArea(item['area_terreno'] ?? '');

      const isVertical = tipologia === 'apartamento' || tipologia === 'penthouse';
      const areaPrivativa = isVertical ? areaNorm : null;
      const areaConstruida = !isVertical ? areaNorm : null;

      const slug = gerarSlug(ref, titulo);
      const existente = db.prepare('SELECT id FROM imoveis WHERE ref = ?').get(ref) as { id: string } | undefined;
      const imovelId = existente?.id ?? randomUUID();

      const andarRaw = item['andar'] ? Number.parseInt(item['andar'], 10) : null;
      const andar = andarRaw !== null && !Number.isNaN(andarRaw) ? andarRaw : null;
      const quartos = Number.parseInt(item['quartos'] ?? '0', 10) || 0;
      const banheiros = item['banheiros'] ? Number.parseInt(item['banheiros'], 10) : null;
      const vagas = item['vagas'] ? Number.parseInt(item['vagas'], 10) : null;

      insertImovel.run(
        imovelId, ref, slug, titulo, tipologia, praca,
        item['cidade'] ?? '', item['bairro'] ?? '', item['descricao'] ?? '',
        precoObj?.valor ?? null, precoObj?.moeda ?? null,
        areaPrivativa, areaConstruida, terrenoNorm,
        quartos, banheiros, vagas, andar,
        item['parceiro'] ?? '', situacao, agora, agora
      );

      // Fotos: deleta registros antigos e recria
      deleteImagens.run(imovelId);
      const fotos = fotosPorRef.get(ref) ?? [];
      fotos.forEach((nomeFoto, ordem) => {
        const caminhoOrigem = resolve('./imagens', nomeFoto);
        const caminhoDestino = join(uploadDir, nomeFoto);
        if (existsSync(caminhoOrigem) && !existsSync(caminhoDestino)) {
          copyFileSync(caminhoOrigem, caminhoDestino);
        }
        insertImagem.run(
          randomUUID(), imovelId, `/media/${nomeFoto}`,
          `${titulo} - Foto ${ordem + 1}`, ordem, agora
        );
      });
    }
  });

  seedTransacao();
  console.log(`[seed] Imóveis importados: ${registros.length}`);

  // 6. Textos institucionais padrão (Anexo A)
  const insertTexto = db.prepare(`
    INSERT OR REPLACE INTO textos_site (chave, conteudo_json, atualizado_em) VALUES (?, ?, ?)
  `);
  insertTexto.run('inicio', JSON.stringify({
    titulo: 'Patrimônio não se compra, se constrói sob tese.',
    descricao: 'Imóveis com tese. Nas praças que fazem sentido para o seu patrimônio.',
  }), agora);
  insertTexto.run('rodape', JSON.stringify({
    texto: 'Imóveis com tese. Nas praças que fazem sentido para o seu patrimônio.',
    aviso: 'Projeto de avaliação técnica. Imóveis, valores e contatos fictícios.',
  }), agora);

  console.log('[seed] Textos institucionais padrão semeados.');
}

// Execução direta via CLI
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  semearBase()
    .then(() => {
      console.log('[seed] Semeadura concluída com sucesso.');
      fecharBanco();
    })
    .catch((err: unknown) => {
      console.error('[seed] Erro na semeadura:', err);
      fecharBanco();
      process.exit(1);
    });
}
