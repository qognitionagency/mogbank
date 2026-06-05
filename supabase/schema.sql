-- MogBank Database Schema — ABOS v1.0
-- Reference implementation of the Agent Banking Open Standard.
--
-- This script is the single source of truth for BOTH backends:
--   • apps/web        (Next.js API routes via supabase-js / service role)
--   • apps/backend    (Express via node-postgres / pooler)
--
-- It is re-runnable: it DROPs and recreates all objects. Running it on a
-- database that already holds data is DESTRUCTIVE — back up first. For a
-- fresh Supabase project (initial deploy) this is the correct, clean load.
--
-- Money is ALWAYS stored as BIGINT in the smallest denomination unit
-- (cents for USD/USDC) — never floating point (ABOS Layer 2 requirement).

-- ============================================================
-- Extensions
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- Clean slate (re-runnable)
-- ============================================================
DROP TABLE IF EXISTS idempotency_keys CASCADE;
DROP TABLE IF EXISTS ledger_entries   CASCADE;
DROP TABLE IF EXISTS kya_score_history CASCADE;
DROP TABLE IF EXISTS faucet_claims     CASCADE;
DROP TABLE IF EXISTS audit_logs        CASCADE;
DROP TABLE IF EXISTS api_keys          CASCADE;
DROP TABLE IF EXISTS mandates          CASCADE;
DROP TABLE IF EXISTS escrow            CASCADE;
DROP TABLE IF EXISTS marketplace_services CASCADE;
DROP TABLE IF EXISTS escrow_orders     CASCADE;
DROP TABLE IF EXISTS services          CASCADE;
DROP TABLE IF EXISTS spending_controls CASCADE;
DROP TABLE IF EXISTS transactions      CASCADE;
DROP TABLE IF EXISTS wallets           CASCADE;
DROP TABLE IF EXISTS agents            CASCADE;

DROP FUNCTION IF EXISTS update_updated_at()          CASCADE;
DROP FUNCTION IF EXISTS create_agent(VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, JSONB) CASCADE;
DROP FUNCTION IF EXISTS create_agent_wallet(UUID, VARCHAR, VARCHAR) CASCADE;
DROP FUNCTION IF EXISTS process_transfer(UUID, UUID, BIGINT, BIGINT, VARCHAR) CASCADE;

-- ============================================================
-- AGENTS  (Layer 1 — KYA Identity)
-- ============================================================
-- Columns marked (web) are written by apps/web; (api) by apps/backend.
-- The two code paths populate different subsets, so identity columns are
-- nullable and the table is the union of both models.
CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wallet_address VARCHAR(44) UNIQUE,          -- (web) nullable: api path omits it
  public_key VARCHAR(64),                      -- (web) nullable: api path may omit
  principal_address VARCHAR(44),               -- (web)
  agent_type VARCHAR(20) CHECK (agent_type IN ('langchain', 'crewai', 'autogen', 'custom', 'semantic_kernel')) DEFAULT 'custom',
  kya_score INTEGER DEFAULT 0 CHECK (kya_score >= 0 AND kya_score <= 100),
  kya_status VARCHAR(20) DEFAULT 'pending' CHECK (kya_status IN ('pending', 'in_review', 'verified', 'suspended', 'rejected')),
  email VARCHAR(255),
  metadata JSONB DEFAULT '{}',                 -- (web)
  -- (api) richer identity fields written by apps/backend
  name VARCHAR(255),
  company_name VARCHAR(255),
  jurisdiction VARCHAR(100),
  framework VARCHAR(100),
  capabilities JSONB DEFAULT '[]',
  endpoint_url TEXT,
  openapi_schema TEXT,
  kya_breakdown JSONB DEFAULT '{}',
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'revoked')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- WALLETS  (Layer 2 — Multi-Currency Custody)
-- ============================================================
CREATE TABLE wallets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  address VARCHAR(64),                          -- (api) on-chain/derived address
  currency VARCHAR(10) CHECK (currency IN ('USDC', 'AED', 'USD', 'DDSC')) DEFAULT 'USDC',
  balance BIGINT DEFAULT 0 CHECK (balance >= 0),
  locked_balance BIGINT DEFAULT 0 CHECK (locked_balance >= 0),
  wallet_type VARCHAR(20) CHECK (wallet_type IN ('custody', 'escrow', 'hot', 'cold')) DEFAULT 'custody',
  daily_limit BIGINT,
  session_limit BIGINT,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'frozen', 'closed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(agent_id, currency, wallet_type)
);

-- ============================================================
-- TRANSACTIONS  (Layer 3 — Atomic Value Transfer)
-- Superset of what apps/web and apps/backend both write.
-- ============================================================
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  counterparty_wallet_id UUID REFERENCES wallets(id),
  type VARCHAR(20) NOT NULL CHECK (type IN (
    'transfer', 'payment', 'escrow', 'credit', 'deposit', 'withdrawal',
    'fee', 'escrow_release', 'escrow_refund', 'faucet_claim'
  )),
  amount BIGINT NOT NULL CHECK (amount >= 0),
  fee BIGINT DEFAULT 0 CHECK (fee >= 0),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'failed')),
  -- double-entry discriminator used by the web app's transactions-backed ledger
  ledger_entry VARCHAR(20) CHECK (ledger_entry IN ('debit', 'credit', 'fee_debit')),
  tx_hash VARCHAR(100),
  protocol VARCHAR(20) CHECK (protocol IN ('x402', 'a2a', 'ap2', 'escrow', 'faucet', 'internal', 'standard')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ
);

-- ============================================================
-- LEDGER ENTRIES  (Layer 3 — append-only double-entry ledger)
-- Written by apps/backend (services/ledger.ts). Immutable by convention.
-- ============================================================
CREATE TABLE ledger_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_id UUID NOT NULL,
  wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  entry_type VARCHAR(10) NOT NULL CHECK (entry_type IN ('debit', 'credit')),
  amount BIGINT NOT NULL CHECK (amount >= 0),
  currency VARCHAR(10) NOT NULL DEFAULT 'USDC',
  description TEXT,
  balance_after BIGINT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- IDEMPOTENCY KEYS  (Layer 3 / Security — duplicate suppression)
-- response stored as TEXT (code does JSON.parse on read).
-- ============================================================
CREATE TABLE idempotency_keys (
  key_hash TEXT PRIMARY KEY,
  response TEXT NOT NULL DEFAULT '{}',
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SPENDING CONTROLS  (Layer 3)
-- ============================================================
CREATE TABLE spending_controls (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE UNIQUE,
  daily_limit BIGINT DEFAULT 1000000000,
  session_limit BIGINT DEFAULT 100000000,
  max_per_transaction BIGINT,
  allowed_currencies TEXT[] DEFAULT ARRAY['USDC'],
  counterparty_allowlist TEXT[] DEFAULT '{}',
  counterparty_blocklist TEXT[] DEFAULT '{}',
  rate_limit_per_minute INTEGER DEFAULT 100,
  require_mandate BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SERVICES  (Layer 4 — Marketplace listings)
-- ============================================================
CREATE TABLE services (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  seller_agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  price BIGINT NOT NULL CHECK (price > 0),
  currency VARCHAR(10) DEFAULT 'USDC',
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'paused', 'closed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ESCROW ORDERS  (Layer 4 — three-state escrow automaton)
-- ============================================================
CREATE TABLE escrow_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  buyer_agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  seller_agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  amount BIGINT NOT NULL CHECK (amount > 0),
  status VARCHAR(20) DEFAULT 'locked' CHECK (status IN ('locked', 'released', 'refunded')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  released_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ
);

-- ============================================================
-- MARKETPLACE_SERVICES  (Layer 4 — apps/backend service catalog)
-- The Express API uses a richer service model than the web `services`
-- table (per-call pricing, ratings, OpenAPI schema). Kept separate so
-- both code paths run unmodified against one database.
-- ============================================================
CREATE TABLE marketplace_services (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  service_type VARCHAR(100),
  price_per_call BIGINT NOT NULL CHECK (price_per_call >= 0),
  currency VARCHAR(10) DEFAULT 'USDC',
  endpoint_url TEXT,
  openapi_schema TEXT,
  active BOOLEAN DEFAULT TRUE,
  calls_completed INTEGER DEFAULT 0,
  rating NUMERIC(3,2) DEFAULT 0.0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ESCROW  (Layer 4 — apps/backend wallet-to-wallet escrow)
-- ============================================================
CREATE TABLE escrow (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service_id UUID REFERENCES marketplace_services(id) ON DELETE SET NULL,
  buyer_wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  seller_wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  amount BIGINT NOT NULL CHECK (amount > 0),
  currency VARCHAR(10) DEFAULT 'USDC',
  status VARCHAR(20) DEFAULT 'held' CHECK (status IN ('held', 'released', 'refunded')),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- MANDATES  (Layer 6 — Cryptographic Delegation)
-- ============================================================
CREATE TABLE mandates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  principal_address VARCHAR(44) NOT NULL,
  scope JSONB NOT NULL,
  constraints JSONB NOT NULL,
  signature VARCHAR(128) NOT NULL,
  nonce VARCHAR(64),
  revoked BOOLEAN DEFAULT FALSE,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

-- ============================================================
-- API KEYS
-- ============================================================
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  key_hash VARCHAR(64) NOT NULL,
  name VARCHAR(255),
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- AUDIT LOGS
-- ============================================================
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID REFERENCES agents(id),
  action VARCHAR(100) NOT NULL,
  details JSONB DEFAULT '{}',
  ip_address VARCHAR(45),
  user_agent TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- FAUCET CLAIMS  (testnet token distribution rate limiting)
-- ============================================================
CREATE TABLE faucet_claims (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  amount BIGINT DEFAULT 10000,
  claimed_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- KYA SCORE HISTORY  (KYA-7 breakdown)
-- ============================================================
CREATE TABLE kya_score_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  principal_identity_score INTEGER DEFAULT 0,
  email_domain_score INTEGER DEFAULT 0,
  agent_metadata_score INTEGER DEFAULT 0,
  use_case_score INTEGER DEFAULT 0,
  jurisdiction_risk_score INTEGER DEFAULT 0,
  technical_capability_score INTEGER DEFAULT 0,
  verification_mode_score INTEGER DEFAULT 0,
  total_score INTEGER DEFAULT 0,
  calculated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_agents_wallet            ON agents(wallet_address);
CREATE INDEX idx_agents_kya_status        ON agents(kya_status);
CREATE INDEX idx_wallets_agent            ON wallets(agent_id);
CREATE INDEX idx_transactions_wallet      ON transactions(wallet_id);
CREATE INDEX idx_transactions_status      ON transactions(status);
CREATE INDEX idx_transactions_created     ON transactions(created_at);
CREATE INDEX idx_ledger_wallet            ON ledger_entries(wallet_id);
CREATE INDEX idx_ledger_transaction       ON ledger_entries(transaction_id);
CREATE INDEX idx_idempotency_expires      ON idempotency_keys(expires_at);
CREATE INDEX idx_services_seller          ON services(seller_agent_id);
CREATE INDEX idx_escrow_buyer             ON escrow_orders(buyer_agent_id);
CREATE INDEX idx_escrow_seller            ON escrow_orders(seller_agent_id);
CREATE INDEX idx_mkt_services_agent       ON marketplace_services(agent_id);
CREATE INDEX idx_mkt_services_active      ON marketplace_services(active);
CREATE INDEX idx_escrow_buyer_wallet      ON escrow(buyer_wallet_id);
CREATE INDEX idx_escrow_seller_wallet     ON escrow(seller_wallet_id);
CREATE INDEX idx_mandates_agent           ON mandates(agent_id);
CREATE INDEX idx_api_keys_agent           ON api_keys(agent_id);
CREATE INDEX idx_api_keys_hash            ON api_keys(key_hash);
CREATE INDEX idx_audit_logs_agent         ON audit_logs(agent_id);
CREATE INDEX idx_audit_logs_timestamp     ON audit_logs(timestamp);
CREATE INDEX idx_faucet_claims_agent      ON faucet_claims(agent_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- Default posture: RLS enabled, deny-by-default for the anon/publishable
-- key. The Supabase `service_role` (used by all server-side write paths)
-- has BYPASSRLS, so server routes are unaffected. SELECT policies below
-- scope any anon/JWT reads to the agent's own rows.
-- ============================================================
ALTER TABLE agents            ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallets           ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_entries    ENABLE ROW LEVEL SECURITY;
ALTER TABLE idempotency_keys  ENABLE ROW LEVEL SECURITY;
ALTER TABLE spending_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE services          ENABLE ROW LEVEL SECURITY;
ALTER TABLE escrow_orders     ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE escrow            ENABLE ROW LEVEL SECURITY;
ALTER TABLE mandates          ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys          ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE faucet_claims     ENABLE ROW LEVEL SECURITY;
ALTER TABLE kya_score_history ENABLE ROW LEVEL SECURITY;

-- Own-data SELECT policies (apply to anon/authenticated; service_role bypasses)
CREATE POLICY "agents_select_own" ON agents
  FOR SELECT USING (id = (auth.jwt() ->> 'agent_id')::uuid);
CREATE POLICY "wallets_select_own" ON wallets
  FOR SELECT USING (agent_id = (auth.jwt() ->> 'agent_id')::uuid);
CREATE POLICY "transactions_select_own" ON transactions
  FOR SELECT USING (wallet_id IN (SELECT id FROM wallets WHERE agent_id = (auth.jwt() ->> 'agent_id')::uuid));
CREATE POLICY "spending_controls_select_own" ON spending_controls
  FOR SELECT USING (agent_id = (auth.jwt() ->> 'agent_id')::uuid);
-- Marketplace listings are intentionally publicly readable (active only)
CREATE POLICY "services_select_public" ON services
  FOR SELECT USING (status = 'active');
CREATE POLICY "marketplace_services_select_public" ON marketplace_services
  FOR SELECT USING (active = TRUE);
-- Escrow visible to either party
CREATE POLICY "escrow_select_party" ON escrow_orders
  FOR SELECT USING (
    buyer_agent_id  = (auth.jwt() ->> 'agent_id')::uuid OR
    seller_agent_id = (auth.jwt() ->> 'agent_id')::uuid
  );
-- mandates / api_keys / audit_logs / ledger_entries / idempotency_keys:
-- NO anon policy → deny-by-default. Only service_role (BYPASSRLS) may read.

-- ============================================================
-- updated_at trigger
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_agents_updated_at        BEFORE UPDATE ON agents        FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_wallets_updated_at       BEFORE UPDATE ON wallets       FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_transactions_updated_at  BEFORE UPDATE ON transactions  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_services_updated_at      BEFORE UPDATE ON services      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_spending_updated_at      BEFORE UPDATE ON spending_controls FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_mkt_services_updated_at  BEFORE UPDATE ON marketplace_services FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_escrow_updated_at        BEFORE UPDATE ON escrow        FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- Atomic transfer helper (used by apps/backend optional path)
-- ============================================================
CREATE OR REPLACE FUNCTION process_transfer(
  p_from_wallet_id UUID,
  p_to_wallet_id UUID,
  p_amount BIGINT,
  p_fee BIGINT DEFAULT 0,
  p_protocol VARCHAR DEFAULT 'x402'
)
RETURNS BOOLEAN AS $$
DECLARE
  v_from_balance BIGINT;
BEGIN
  SELECT balance INTO v_from_balance FROM wallets WHERE id = p_from_wallet_id FOR UPDATE;
  IF v_from_balance IS NULL THEN
    RAISE EXCEPTION 'Sender wallet not found';
  END IF;
  IF v_from_balance < (p_amount + p_fee) THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  UPDATE wallets SET balance = balance - (p_amount + p_fee) WHERE id = p_from_wallet_id;
  UPDATE wallets SET balance = balance + p_amount            WHERE id = p_to_wallet_id;

  INSERT INTO transactions (wallet_id, counterparty_wallet_id, type, amount, fee, status, protocol, confirmed_at)
  VALUES (p_from_wallet_id, p_to_wallet_id, 'transfer', p_amount, p_fee, 'confirmed', p_protocol, NOW());

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- Grants (service_role is the server-side identity)
-- ============================================================
GRANT ALL ON ALL TABLES    IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;
