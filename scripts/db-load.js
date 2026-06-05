// Loads supabase/schema.sql into the target database. Run with DB_HOST/DB_PASSWORD set.
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function main() {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'schema.sql'), 'utf8');
  const client = new Client({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });
  await client.connect();
  console.log('Connected. Executing schema.sql ...');
  await client.query(sql);
  const t = await client.query(
    `select table_name from information_schema.tables where table_schema='public' order by 1`
  );
  console.log('OK. Tables now (' + t.rowCount + '):', t.rows.map(r => r.table_name).join(', '));
  await client.end();
}
main().catch(e => { console.error('LOAD_ERROR:', e.message); process.exit(2); });
