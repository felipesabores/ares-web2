-- ═══════════════════════════════════════════════════════════════════════
-- Predator2 — painel de controle dos jobs de coleta
--
-- O ares-web só ESCREVE configuração nestas tabelas; o predator LÊ e executa.
-- Nenhuma credencial é guardada aqui: login do Brudam e senha do banco ficam
-- em variáveis de ambiente do predator.
--
-- Idempotente: pode ser rodado mais de uma vez.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Jobs (um por relatório/função) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS predator_jobs (
  id                      text PRIMARY KEY CHECK (id ~ '^[a-z0-9_]{1,40}$'),
  nome                    text NOT NULL,
  descricao               text,
  tipo                    text NOT NULL DEFAULT 'brudam_relatorio',
  ativo                   boolean NOT NULL DEFAULT true,

  -- Agendamento: intervalo "diurno" dentro da janela, "noturno" fora dela
  -- (horário de America/Sao_Paulo). intervalo_noturno_min NULL = usa o diurno.
  intervalo_min           integer NOT NULL DEFAULT 15  CHECK (intervalo_min BETWEEN 1 AND 1440),
  intervalo_noturno_min   integer          DEFAULT 90  CHECK (intervalo_noturno_min BETWEEN 1 AND 1440),
  janela_inicio           time    NOT NULL DEFAULT '06:00',
  janela_fim              time    NOT NULL DEFAULT '20:00',

  -- Pausa temporária: não roda até esta data/hora (NULL = sem pausa)
  pausado_ate             timestamptz,

  -- Parâmetros livres do job (ex.: {"dias_retroativos": 30, "filial": "VIX"})
  parametros              jsonb   NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(parametros) = 'object'),
  tabela_destino          text,
  modo_gravacao           text    NOT NULL DEFAULT 'substituir'
                            CHECK (modo_gravacao IN ('substituir', 'acumular', 'upsert')),
  timeout_seg             integer NOT NULL DEFAULT 600 CHECK (timeout_seg BETWEEN 30 AND 7200),
  max_tentativas          smallint NOT NULL DEFAULT 2  CHECK (max_tentativas BETWEEN 1 AND 5),
  ordem                   smallint NOT NULL DEFAULT 100,

  -- "Rodar agora": o ares-web marca, o predator executa no próximo ciclo
  execucao_solicitada_em  timestamptz,
  execucao_solicitada_por text,

  criado_em               timestamptz NOT NULL DEFAULT now(),
  atualizado_em           timestamptz NOT NULL DEFAULT now(),
  atualizado_por          text
);

-- ── 2. Histórico de execuções ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS predator_execucoes (
  id             bigserial PRIMARY KEY,
  job_id         text NOT NULL REFERENCES predator_jobs(id) ON UPDATE CASCADE ON DELETE CASCADE,
  origem         text NOT NULL DEFAULT 'agendado' CHECK (origem IN ('agendado', 'manual', 'retentativa')),
  status         text NOT NULL DEFAULT 'executando'
                   CHECK (status IN ('executando', 'ok', 'erro', 'timeout', 'cancelado')),
  tentativa      smallint NOT NULL DEFAULT 1,
  iniciado_em    timestamptz NOT NULL DEFAULT now(),
  finalizado_em  timestamptz,
  duracao_ms     integer,
  registros      integer,
  erro           text,
  log            text,          -- últimas linhas de log da execução (truncar em ~20 kB)
  host           text,          -- máquina que executou (ex.: lxc-105)
  versao         text           -- versão/commit do predator
);

CREATE INDEX IF NOT EXISTS predator_execucoes_job_idx    ON predator_execucoes (job_id, iniciado_em DESC);
CREATE INDEX IF NOT EXISTS predator_execucoes_inicio_idx ON predator_execucoes (iniciado_em DESC);

-- Trava: no máximo UMA execução em andamento por job.
-- O scheduler faz INSERT ... status='executando'; se violar, o job já está rodando.
CREATE UNIQUE INDEX IF NOT EXISTS predator_execucoes_um_executando
  ON predator_execucoes (job_id) WHERE status = 'executando';

-- ── 3. Auditoria de alterações feitas pela tela ────────────────────────
CREATE TABLE IF NOT EXISTS predator_alteracoes (
  id           bigserial PRIMARY KEY,
  job_id       text NOT NULL REFERENCES predator_jobs(id) ON UPDATE CASCADE ON DELETE CASCADE,
  usuario      text NOT NULL,
  acao         text NOT NULL,            -- 'editar', 'rodar_agora'
  antes        jsonb,
  depois       jsonb,
  em           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS predator_alteracoes_job_idx ON predator_alteracoes (job_id, em DESC);

-- ── 4. Visão de status (usada pela tela e, depois, pela I.A do WhatsApp) ─
CREATE OR REPLACE VIEW predator_jobs_status AS
WITH base AS (
  SELECT
    j.*,
    u.id              AS ultima_execucao_id,
    u.status          AS ultimo_status,
    u.iniciado_em     AS ultimo_inicio,
    u.finalizado_em   AS ultimo_fim,
    u.duracao_ms      AS ultima_duracao_ms,
    u.registros       AS ultimos_registros,
    u.erro            AS ultimo_erro,
    ok.finalizado_em  AS ultimo_ok_em,
    ok.registros      AS ultimo_ok_registros,
    COALESCE(s.total_24h, 0)  AS execucoes_24h,
    COALESCE(s.erros_24h, 0)  AS erros_24h,
    s.duracao_media_ms_24h,
    CASE
      WHEN (now() AT TIME ZONE 'America/Sao_Paulo')::time >= j.janela_inicio
       AND (now() AT TIME ZONE 'America/Sao_Paulo')::time <  j.janela_fim
      THEN j.intervalo_min
      ELSE COALESCE(j.intervalo_noturno_min, j.intervalo_min)
    END AS intervalo_vigente_min
  FROM predator_jobs j
  LEFT JOIN LATERAL (
    SELECT * FROM predator_execucoes e
    WHERE e.job_id = j.id ORDER BY e.iniciado_em DESC LIMIT 1
  ) u ON true
  LEFT JOIN LATERAL (
    SELECT e.finalizado_em, e.registros FROM predator_execucoes e
    WHERE e.job_id = j.id AND e.status = 'ok' ORDER BY e.iniciado_em DESC LIMIT 1
  ) ok ON true
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*)                                              AS total_24h,
      COUNT(*) FILTER (WHERE e.status IN ('erro', 'timeout')) AS erros_24h,
      ROUND(AVG(e.duracao_ms) FILTER (WHERE e.status = 'ok'))::int AS duracao_media_ms_24h
    FROM predator_execucoes e
    WHERE e.job_id = j.id AND e.iniciado_em >= now() - interval '24 hours'
  ) s ON true
)
SELECT
  base.*,
  CASE
    WHEN base.execucao_solicitada_em IS NOT NULL
     AND base.execucao_solicitada_em > COALESCE(base.ultimo_inicio, '-infinity'::timestamptz)
      THEN now()
    WHEN NOT base.ativo THEN NULL
    ELSE GREATEST(
      COALESCE(base.ultimo_inicio + make_interval(mins => base.intervalo_vigente_min), now()),
      COALESCE(base.pausado_ate, '-infinity'::timestamptz)
    )
  END AS proxima_execucao_prevista
FROM base;

-- ── 5. Jobs iniciais = relatórios do predator 1 ────────────────────────
-- Nomes, tabelas e modos podem ser ajustados pela tela depois.
INSERT INTO predator_jobs (id, nome, descricao, tabela_destino, modo_gravacao, ordem) VALUES
  ('r106',  'Emissões (106)',            'Relatório 106 sem recebedor',          'emissoes',        'upsert',     10),
  ('r106f', 'Emissões filtrado (106f)',  'Variação filtrada do relatório 106',   NULL,              'substituir', 11),
  ('r138',  'Relatório 138',             NULL,                                   NULL,              'substituir', 20),
  ('r147',  'Custos de operação (147)',  'Janela desde Jan/26',                  'custos_operacao', 'substituir', 30),
  ('r027',  'Relatório 027',             NULL,                                   NULL,              'substituir', 40),
  ('r399',  'Relatório 399',             NULL,                                   NULL,              'substituir', 50),
  ('r129',  'Relatório 129',             NULL,                                   NULL,              'substituir', 60),
  ('r295',  'Relatório 295',             NULL,                                   NULL,              'substituir', 70),
  ('r314',  'Relatório 314',             NULL,                                   NULL,              'substituir', 80)
ON CONFLICT (id) DO NOTHING;

COMMIT;
