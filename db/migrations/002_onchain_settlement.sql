-- 002 — on-chain settlement (deposits and withdrawals)
--
-- MogBank is a custodial ledger: agent-to-agent payments stay off-chain, and
-- the chain is used only where value enters and leaves. These two tables are
-- the boundary record.

-- A confirmed USDC transfer into the treasury, credited to an agent's wallet.
-- tx_hash is UNIQUE: that constraint, not application logic, is what stops the
-- same deposit being claimed twice.
CREATE TABLE IF NOT EXISTS onchain_deposits (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id      UUID NOT NULL REFERENCES agents(id)  ON DELETE CASCADE,
  wallet_id     UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  tx_hash       TEXT NOT NULL UNIQUE,
  chain_id      INTEGER NOT NULL,
  token_address TEXT NOT NULL,
  from_address  TEXT,
  amount        BIGINT NOT NULL CHECK (amount > 0),   -- ledger cents
  confirmations INTEGER,
  credited_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_onchain_deposits_agent ON onchain_deposits(agent_id);

-- A payout. The row is created in the same statement that debits the wallet,
-- before anything is broadcast, so a crash mid-flight leaves a 'pending' row
-- to reconcile rather than money that left with no record.
CREATE TABLE IF NOT EXISTS onchain_withdrawals (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id      UUID NOT NULL REFERENCES agents(id)  ON DELETE CASCADE,
  wallet_id     UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  to_address    TEXT NOT NULL,
  amount        BIGINT NOT NULL CHECK (amount > 0),   -- ledger cents
  chain_id      INTEGER NOT NULL,
  status        VARCHAR(20) NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'submitted', 'confirmed', 'failed')),
  tx_hash       TEXT,
  error         TEXT,
  requested_at  TIMESTAMPTZ DEFAULT NOW(),
  submitted_at  TIMESTAMPTZ,
  confirmed_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_onchain_withdrawals_agent  ON onchain_withdrawals(agent_id);
CREATE INDEX IF NOT EXISTS idx_onchain_withdrawals_status ON onchain_withdrawals(status);

-- The ledger already allows 'deposit' and 'withdrawal' transaction types; the
-- settlement protocol needs its own label so on-chain movement is separable
-- from the faucet and from internal transfers.
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_protocol_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_protocol_check
  CHECK (protocol IN ('x402','a2a','ap2','escrow','faucet','internal','standard','onchain'));
