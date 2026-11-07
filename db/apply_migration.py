"""
Aplica um arquivo de migration SQL no ares_bi e confere os jobs do Predator.

Uso:
  PGPASSWORD=... python3 db/apply_migration.py db/migrations/001_predator_control.sql

Conexão por variáveis de ambiente, todas obrigatórias exceto a porta:
  PGHOST PGPORT (5432) PGDATABASE PGUSER PGPASSWORD
Use o banco do ARES 2.0. Nunca aponte para o banco de produção do ARES 1.
"""

import os
import sys

import psycopg2

if len(sys.argv) != 2:
    sys.exit(__doc__)

sql = open(sys.argv[1], encoding="utf-8").read()
missing = [k for k in ("PGHOST", "PGDATABASE", "PGUSER", "PGPASSWORD") if not os.environ.get(k)]
if missing:
    sys.exit("Defina " + ", ".join(missing) + ".")

conn = psycopg2.connect(
    host=os.environ["PGHOST"],
    port=int(os.environ.get("PGPORT", "5432")),
    dbname=os.environ["PGDATABASE"],
    user=os.environ["PGUSER"],
    password=os.environ["PGPASSWORD"],
    connect_timeout=10,
)
conn.autocommit = True  # o arquivo já tem BEGIN/COMMIT
cur = conn.cursor()
cur.execute(sql)
print("Migration aplicada.")

cur.execute("SELECT id, ativo, intervalo_min, intervalo_noturno_min FROM predator_jobs ORDER BY ordem, id")
for row in cur.fetchall():
    print("  ", *row)
cur.execute("SELECT count(*) FROM predator_jobs_status")
print("predator_jobs_status:", cur.fetchone()[0], "jobs")
conn.close()
