// Read-only connectivity + inventory check before loading the schema.
// Tries the Supabase direct host (IPv6) and is also reused with the pooler.
const { Client } = require('pg');

const PW = process.env.DB_PASSWORD;
const HOST = process.env.DB_HOST;
const USER = process.env.DB_USER || 'postgres';
const PORT = parseInt(process.env.DB_PORT || '5432', 10);

async function main() {
  const client = new Client({
    host: HOST, port: PORT, user: USER, password: PW,
    database: 'postgres', ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  });
  await client.connect();
  const v = await client.query('select version()');
  console.log('CONNECTED:', v.rows[0].version.split(',')[0]);
  const t = await client.query(
    `select table_name from information_schema.tables where table_schema='public' order by 1`
  );
  console.log('PUBLIC TABLES (' + t.rowCount + '):', t.rows.map(r => r.table_name).join(', ') || '(none)');
  for (const r of t.rows) {
    try {
      const c = await client.query(`select count(*)::int n from "${r.table_name}"`);
      if (c.rows[0].n > 0) console.log('  rows', r.table_name, '=', c.rows[0].n);
    } catch {}
  }
  await client.end();
}
main().catch(e => { console.error('CONN_ERROR:', e.message); process.exit(2); });
