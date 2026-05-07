-- MogBank Database Schema - ABOS v1.0
-- Run this in Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- AGENTS TABLE (Layer 1 - KYA Identity)
CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wallet_address VARCHAR(44) UNIQUE NOT NULL,
  public_key VARCHAR(64) NOT NULL,
  principal_address VARCHAR(44) NOT NULL,
  agent_type VARCHAR(20) CHECK (agent_type IN ('langchain', 'crewai', 'autogen', 'custom', 'semantic_kernel')) DEFAULT 'custom',
  kya_score INTEGER DEFAULT 0 CHECK (kya_score >= 0 AND kya_score <= 100),
  kya_status VARCHAR(20) DEFAULT 'pending' CHECK (kya_status IN ('pending', 'in_review', 'verified', 'suspended')),
  email VARCHAR(255),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- WALLETS TABLE (Layer 2 - Multi-Currency Custody)
CREATE TABLE wallets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  currency VARCHAR(10) CHECK (currency IN ('USDC', 'AED', 'USD')) DEFAULT 'USDC',
  balance BIGINT DEFAULT 0 CHECK (balance >= 0),
  wallet_type VARCHAR(20) CHECK (wallet_type IN ('custody', 'escrow', 'hot', 'cold')) DEFAULT 'custody',
  daily_limit BIGINT,
  session_limit BIGINT,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'frozen', 'closed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(agent_id, currency, wallet_type)
);

-- TRANSACTIONS TABLE (Layer 3 - Atomic Value Transfer)
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  counterparty_wallet_id UUID REFERENCES wallets(id),
  type VARCHAR(20) CHECK (type IN ('transfer', 'payment', 'escrow', 'credit')) NOT NULL,
  amount BIGINT NOT NULL CHECK (amount > 0),
  fee BIGINT DEFAULT 0 CHECK (fee >= 0),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'failed')),
  tx_hash VARCHAR(66),
  protocol VARCHAR(20) CHECK (protocol IN ('x402', 'a2a', 'ap2')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ
);

-- SPENDING CONTROLS TABLE (Layer 3)
CREATE TABLE spending_controls (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE UNIQUE,
  daily_limit BIGINT DEFAULT 1000000000,
  session_limit BIGINT DEFAULT 100000000,
  allowed_currencies TEXT[] DEFAULT ARRAY['USDC'],
  counterparty_allowlist TEXT[] DEFAULT '{}',
  counterparty_blocklist TEXT[] DEFAULT '{}',
  rate_limit_per_minute INTEGER DEFAULT 100,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- SERVICES TABLE (Layer 4 - Marketplace)
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

-- ESCROW ORDERS TABLE (Layer 4 - Three-State Escrow)
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

-- MANDATES TABLE (Layer 6 - Cryptographic Delegation)
CREATE TABLE mandates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  principal_address VARCHAR(44) NOT NULL,
  scope JSONB NOT NULL,
  constraints JSONB NOT NULL,
  signature VARCHAR(128) NOT NULL,
  revoked BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

-- API KEYS TABLE
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  key_hash VARCHAR(64) NOT NULL,
  name VARCHAR(255),
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- AUDIT LOGS TABLE
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID REFERENCES agents(id),
  action VARCHAR(100) NOT NULL,
  details JSONB DEFAULT '{}',
  ip_address VARCHAR(45),
  user_agent TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- FAUCET CLAIMS TABLE
CREATE TABLE faucet_claims (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID NOT NULL REFERENCES agents(id),
  amount BIGINT DEFAULT 10000,
  claimed_at TIMESTAMPTZ DEFAULT NOW()
);

-- KYA SCORE HISTORY TABLE
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

-- INDEXES
CREATE INDEX idx_agents_wallet ON agents(wallet_address);
CREATE INDEX idx_agents_kya_status ON agents(kya_status);
CREATE INDEX idx_wallets_agent ON wallets(agent_id);
CREATE INDEX idx_transactions_wallet ON transactions(wallet_id);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_services_seller ON services(seller_agent_id);
CREATE INDEX idx_escrow_buyer ON escrow_orders(buyer_agent_id);
CREATE INDEX idx_escrow_seller ON escrow_orders(seller_agent_id);
CREATE INDEX idx_mandates_agent ON mandates(agent_id);
CREATE INDEX idx_api_keys_agent ON api_keys(agent_id);
CREATE INDEX idx_audit_logs_agent ON audit_logs(agent_id);
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp);

-- ROW LEVEL SECURITY (RLS) - Security 2026 Standard
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE spending_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE escrow_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE mandates ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE faucet_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE kya_score_history ENABLE ROW LEVEL SECURITY;

-- RLS POLICIES - Agents can only access their own data
CREATE POLICY "Agents can read their own data" ON agents
  FOR SELECT USING (id = (auth.jwt() ->> 'agent_id')::uuid);

CREATE POLICY "Agents can read own wallets" ON wallets
  FOR SELECT USING (agent_id = (auth.jwt() ->> 'agent_id')::uuid);

CREATE POLICY "Agents can read own transactions" ON transactions
  FOR SELECT USING (wallet_id IN (SELECT id FROM wallets WHERE agent_id = (auth.jwt() ->> 'agent_id')::uuid));

CREATE POLICY "Agents can read own spending controls" ON spending_controls
  FOR SELECT USING (agent_id = (auth.jwt() ->> 'agent_id')::uuid);

CREATE POLICY "Agents can read own services" ON services
  FOR SELECT USING (seller_agent_id = (auth.jwt() ->> 'agent_id')::uuid);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_agents_updated_at
  BEFORE UPDATE ON agents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_wallets_updated_at
  BEFORE UPDATE ON wallets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_services_updated_at
  BEFORE UPDATE ON services
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Admin function to create agent (bypasses RLS for service role)
CREATE OR REPLACE FUNCTION create_agent(
  p_wallet_address VARCHAR,
  p_public_key VARCHAR,
  p_principal_address VARCHAR,
  p_agent_type VARCHAR,
  p_email VARCHAR,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID AS $$
DECLARE
  v_agent_id UUID;
BEGIN
  INSERT INTO agents (wallet_address, public_key, principal_address, agent_type, email, metadata, kya_score, kya_status)
  VALUES (p_wallet_address, p_public_key, p_principal_address, p_agent_type, p_email, p_metadata, 0, 'pending')
  RETURNING id INTO v_agent_id;
  
  RETURN v_agent_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create wallet for agent
CREATE OR REPLACE FUNCTION create_agent_wallet(
  p_agent_id UUID,
  p_currency VARCHAR DEFAULT 'USDC',
  p_wallet_type VARCHAR DEFAULT 'custody'
)
RETURNS UUID AS $$
DECLARE
  v_wallet_id UUID;
BEGIN
  INSERT INTO wallets (agent_id, currency, wallet_type, balance, status)
  VALUES (p_agent_id, p_currency, p_wallet_type, 0, 'active')
  RETURNING id INTO v_wallet_id;
  
  RETURN v_wallet_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to process transfer (atomic)
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
  v_result BOOLEAN := FALSE;
BEGIN
  -- Check sufficient balance
  SELECT balance INTO v_from_balance FROM wallets WHERE id = p_from_wallet_id FOR UPDATE;
  
  IF v_from_balance < (p_amount + p_fee) THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;
  
  -- Atomic debit
  UPDATE wallets SET balance = balance - (p_amount + p_fee)
  WHERE id = p_from_wallet_id;
  
  -- Atomic credit
  UPDATE wallets SET balance = balance + p_amount
  WHERE id = p_to_wallet_id;
  
  -- Record transaction
  INSERT INTO transactions (wallet_id, counterparty_wallet_id, type, amount, fee, status, protocol)
  VALUES (p_from_wallet_id, p_to_wallet_id, 'transfer', p_amount, p_fee, 'confirmed', p_protocol);
  
  v_result := TRUE;
  RETURN v_result;
EXCEPTION
  WHEN OTHERS THEN
    RAISE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions (adjust for your auth setup)
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;