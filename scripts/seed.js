const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://mkushvohaysmlrbdwcom.supabase.co',
  'sb_secret_DMmPJOPJEZmdTnGtA9NZgQ_c0eTdU4P'
);

const modelNames = ['ChatGPT', 'Claude', 'DeepSeek', 'Gemini', 'LLaMA', 'Mistral', 'Qwen', 'Cohere'];
const orgs = ['openai', 'anthropic', 'deepseek', 'google', 'meta', 'mistral', 'qwen', 'cohere'];
const domains = ['api.internal', 'agent.internal', 'model.internal', 'bot.internal', 'ai.internal'];
const agentTypes = ['langchain', 'crewai', 'autogen', 'custom', 'semantic_kernel'];

function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function genWallet() { return '0x' + Array.from({length: 40}, () => '0123456789abcdef'[rand(0,15)]).join(''); }
function genPubKey() { return Array.from({length: 64}, () => '0123456789abcdef'[rand(0,15)]).join(''); }
function daysAgo(d) { const dt = new Date(); dt.setDate(dt.getDate() - d); return dt.toISOString(); }

async function seed() {
  console.log('🌱 Seeding MogBank with AI agents...\n');

  // Clear existing data
  console.log('Clearing existing data...');
  await supabase.from('transactions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('escrow_orders').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('services').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('faucet_claims').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('spending_controls').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('wallets').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('audit_logs').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('api_keys').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('mandates').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('kya_score_history').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('agents').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  // Create agents
  const agentCount = 55;
  const agents = [];
  
  for (let i = 0; i < agentCount; i++) {
    const model = pick(modelNames);
    const org = orgs[modelNames.indexOf(model)];
    const agent = {
      wallet_address: genWallet(),
      public_key: genPubKey(),
      principal_address: genWallet(),
      agent_type: pick(agentTypes),
      kya_score: rand(55, 95),
      kya_status: rand(1, 5) === 1 ? 'pending' : 'verified',
      email: `${model.toLowerCase()}-${rand(1,99)}@${org}.${pick(domains)}`,
      metadata: { model_name: model, short_name: model.toLowerCase(), capabilities: [pick(['payments', 'wallets', 'marketplace', 'data-analysis', 'code-review', 'research'])], endpoint_url: `https://${org}.com/api/${model.toLowerCase()}` },
      created_at: daysAgo(rand(1, 30)),
      updated_at: new Date().toISOString()
    };
    agents.push(agent);
  }

  const { data: createdAgents, error: agentError } = await supabase.from('agents').insert(agents).select();
  if (agentError) { console.error('Agent error:', agentError); return; }
  console.log(`✅ ${createdAgents.length} agents created`);

  // Create wallets for each agent
  const wallets = [];
  for (const agent of createdAgents) {
    wallets.push({
      agent_id: agent.id,
      currency: 'USDC',
      balance: rand(1000, 50000000),
      wallet_type: 'custody',
      daily_limit: 1000000000,
      session_limit: 100000000,
      status: 'active',
      created_at: agent.created_at
    });
  }

  const { data: createdWallets, error: walletError } = await supabase.from('wallets').insert(wallets).select();
  if (walletError) { console.error('Wallet error:', walletError); return; }
  console.log(`✅ ${createdWallets.length} wallets created`);

  // Create spending controls
  const controls = createdAgents.map(a => ({
    agent_id: a.id,
    daily_limit: 1000000000,
    session_limit: 100000000,
    allowed_currencies: ['USDC'],
    counterparty_allowlist: [],
    counterparty_blocklist: [],
    rate_limit_per_minute: 100
  }));
  await supabase.from('spending_controls').insert(controls);
  console.log(`✅ Spending controls set`);

  // Create transactions
  const transactionCount = 250;
  const transactions = [];
  const protocols = ['x402', 'a2a', 'ap2'];
  const types = ['transfer', 'payment', 'escrow', 'credit'];

  for (let i = 0; i < transactionCount; i++) {
    const fromIdx = rand(0, agents.length - 1);
    let toIdx = rand(0, agents.length - 1);
    while (toIdx === fromIdx) toIdx = rand(0, agents.length - 1);
    
    const amount = rand(100, 10000000);
    const fee = Math.floor(amount * 0.0015);
    
    transactions.push({
      wallet_id: createdWallets[fromIdx].id,
      counterparty_wallet_id: createdWallets[toIdx].id,
      type: pick(types),
      amount: amount,
      fee: fee,
      status: 'confirmed',
      tx_hash: '0x' + Array.from({length: 64}, () => '0123456789abcdef'[rand(0,15)]).join(''),
      protocol: pick(protocols),
      metadata: {},
      created_at: daysAgo(rand(1, 30)),
      confirmed_at: daysAgo(rand(1, 30))
    });
  }

  // Insert in batches
  for (let i = 0; i < transactions.length; i += 50) {
    const batch = transactions.slice(i, i + 50);
    const { error } = await supabase.from('transactions').insert(batch);
    if (error) console.error('Transaction batch error:', error);
  }
  console.log(`✅ ${transactionCount} transactions created`);

  // Create marketplace services
  const services = [];
  const serviceNames = [
    'Text Summarization API', 'Code Review Service', 'Data Analysis Pipeline',
    'Image Generation', 'Speech-to-Text', 'Translation API',
    'Sentiment Analysis', 'Document Parsing', 'Web Scraping Service',
    'API Monitoring', 'Content Moderation', 'Research Assistant',
    'PDF Extraction', 'Email Classification', 'Chatbot Hosting'
  ];

  for (let i = 0; i < 15; i++) {
    const sellerIdx = rand(0, agents.length - 1);
    services.push({
      seller_agent_id: createdAgents[sellerIdx].id,
      name: pick(serviceNames),
      description: `Agent-powered ${pick(['real-time', 'batch', 'streaming', 'on-demand'])} service for ${pick(['data processing', 'content generation', 'analysis', 'automation'])}`,
      price: rand(100, 50000),
      currency: 'USDC',
      status: 'active',
      created_at: daysAgo(rand(1, 20))
    });
  }
  const { data: createdServices } = await supabase.from('services').insert(services).select();
  console.log(`✅ ${createdServices.length} marketplace services listed`);

  // Create escrow orders
  const escrowOrders = [];
  for (let i = 0; i < 20; i++) {
    const buyerIdx = rand(0, agents.length - 1);
    let sellerIdx = rand(0, agents.length - 1);
    while (sellerIdx === buyerIdx) sellerIdx = rand(0, agents.length - 1);
    const serviceIdx = rand(0, createdServices.length - 1);
    const status = pick(['locked', 'released', 'released', 'released', 'refunded']);
    
    escrowOrders.push({
      buyer_agent_id: createdAgents[buyerIdx].id,
      seller_agent_id: createdAgents[sellerIdx].id,
      service_id: createdServices[serviceIdx].id,
      amount: rand(100, 50000),
      status: status,
      created_at: daysAgo(rand(1, 15)),
      released_at: status === 'released' ? daysAgo(rand(1, 10)) : null,
      refunded_at: status === 'refunded' ? daysAgo(rand(1, 10)) : null
    });
  }
  await supabase.from('escrow_orders').insert(escrowOrders);
  console.log(`✅ ${escrowOrders.length} escrow orders created`);

  // Create KYA score history
  const kyaHistory = createdAgents.map(a => ({
    agent_id: a.id,
    principal_identity_score: rand(5, 15),
    email_domain_score: rand(3, 10),
    agent_metadata_score: rand(5, 15),
    use_case_score: rand(10, 20),
    jurisdiction_risk_score: rand(5, 15),
    technical_capability_score: rand(5, 15),
    verification_mode_score: rand(3, 10),
    total_score: a.kya_score,
    calculated_at: a.created_at
  }));
  await supabase.from('kya_score_history').insert(kyaHistory);
  console.log(`✅ KYA score history recorded`);

  // Count summary
  const { count: totalAgents } = await supabase.from('agents').select('*', { count: 'exact', head: true });
  const { count: totalTx } = await supabase.from('transactions').select('*', { count: 'exact', head: true });
  const { data: totalVolume } = await supabase.rpc('get_total_volume').maybeSingle();
  
  console.log('\n📊 MOG BANK SUMMARY');
  console.log(`   Total Agents: ${totalAgents}`);
  console.log(`   Total Transactions: ${totalTx}`);
  console.log(`   Bank Value: flowing through ${totalAgents} agent wallets`);
  console.log('\n🚀 MogBank is LIVE at https://mogbank.vercel.app');
  console.log('   Discovery: https://mogbank.vercel.app/.well-known/abos.json');
}

seed().catch(console.error);