// Probe Supabase Session Pooler hosts to discover the project's region.
const { Client } = require('pg');
const REF = 'mureitfujzcablshzizv';
const PW = process.env.DB_PASSWORD;
const regions = [
  'ap-southeast-1','ap-south-1','ap-southeast-2','ap-northeast-1','ap-northeast-2',
  'us-east-1','us-east-2','us-west-1','us-west-2',
  'eu-west-1','eu-west-2','eu-west-3','eu-central-1','eu-central-2',
  'sa-east-1','ca-central-1',
];
const prefixes = ['aws-0','aws-1'];

async function tryHost(host) {
  const client = new Client({
    host, port: 5432, user: `postgres.${REF}`, password: PW,
    database: 'postgres', ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 4000,
  });
  try {
    await client.connect();
    await client.query('select 1');
    await client.end();
    return true;
  } catch (e) {
    try { await client.end(); } catch {}
    return e.code === 'ENOTFOUND' ? null : e.message;
  }
}

(async () => {
  for (const p of prefixes) {
    for (const r of regions) {
      const host = `${p}-${r}.pooler.supabase.com`;
      const res = await tryHost(host);
      if (res === true) { console.log('FOUND_POOLER_HOST=' + host); process.exit(0); }
      else if (res && res !== null) console.log('reachable-but-failed', host, '->', res);
    }
  }
  console.log('NO_POOLER_FOUND');
  process.exit(1);
})();
