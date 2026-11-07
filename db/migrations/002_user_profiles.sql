-- Perfil dos usuários (e-mail, telefone, avatar). Antes era criada pela própria
-- rota /api/profile a cada request; agora fica numa migration porque o usuário
-- do banco da aplicação (ares2_web) não tem permissão de CREATE.
CREATE TABLE IF NOT EXISTS user_profiles (
  username   TEXT PRIMARY KEY,
  email      TEXT,
  phone      TEXT,
  avatar     TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
