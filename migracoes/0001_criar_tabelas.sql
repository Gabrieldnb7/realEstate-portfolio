-- Migração 0001: Criação das tabelas centrais do sistema
CREATE TABLE IF NOT EXISTS usuarios (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  senha_hash TEXT NOT NULL,
  criado_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessoes (
  id TEXT PRIMARY KEY,
  usuario_id TEXT NOT NULL,
  expira_em TEXT NOT NULL,
  criado_em TEXT NOT NULL,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS imoveis (
  id TEXT PRIMARY KEY,
  ref TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  titulo TEXT NOT NULL,
  tipologia TEXT NOT NULL,
  pais TEXT NOT NULL,
  cidade TEXT NOT NULL,
  bairro TEXT NOT NULL,
  descricao TEXT NOT NULL,
  preco_valor TEXT,
  preco_moeda TEXT,
  area_privativa TEXT,
  area_construida TEXT,
  area_terreno TEXT,
  quartos INTEGER NOT NULL,
  banheiros INTEGER,
  vagas INTEGER,
  andar INTEGER,
  parceiro TEXT NOT NULL,
  situacao TEXT NOT NULL DEFAULT 'rascunho',
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS imagens (
  id TEXT PRIMARY KEY,
  imovel_id TEXT NOT NULL,
  url TEXT NOT NULL,
  alt TEXT NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL,
  FOREIGN KEY (imovel_id) REFERENCES imoveis(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS textos_site (
  chave TEXT PRIMARY KEY,
  conteudo_json TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);
