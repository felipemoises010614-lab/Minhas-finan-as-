CREATE TABLE IF NOT EXISTS lancamentos (
  id TEXT PRIMARY KEY,
  tipo TEXT NOT NULL CHECK (tipo IN ('gasto', 'entrada')),
  data TEXT NOT NULL,
  descricao TEXT NOT NULL,
  categoria TEXT NOT NULL,
  valor INTEGER NOT NULL CHECK (valor > 0),
  origem TEXT NOT NULL DEFAULT 'app',
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_lancamentos_data ON lancamentos (data);

CREATE TABLE IF NOT EXISTS mensagens (
  id TEXT PRIMARY KEY,
  recebida_em TEXT NOT NULL DEFAULT (datetime('now'))
);
