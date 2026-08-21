// Load db/schema.neon.sql into the target database.
//
//   DATABASE_URL="postgres://..." node scripts/db-load.js
//
// The schema is destructive and re-runnable: it drops and recreates every
// table. Never point this at a database holding real data.
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('Set DATABASE_URL to the Neon connection string.');
    process.exit(1);
  }

  const sql = fs.readFileSync(
    path.join(__dirname, '..', 'db', 'schema.neon.sql'),
    'utf8'
  );

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: true },
  });

  await client.connect();
  try {
    await client.query(sql);
    const { rows } = await client.query(
      `SELECT count(*)::int AS tables
         FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`
    );
    console.log(`Schema loaded — ${rows[0].tables} tables.`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Schema load failed:', err.message);
  process.exit(1);
});
