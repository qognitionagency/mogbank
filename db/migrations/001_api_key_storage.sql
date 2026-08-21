-- 001 — make API key storage actually work
--
-- `api_keys.key_hash` was VARCHAR(64), but the stored hash is
-- 'sha512:' + 64 hex characters = 71 characters. Every insert therefore failed
-- with "value too long", and because the registration route never checked the
-- error, registration reported success while silently storing no key at all.
-- No key has ever been persisted, so there is nothing to migrate — only the
-- column to widen before authentication can depend on it.

ALTER TABLE api_keys ALTER COLUMN key_hash TYPE TEXT;

-- Lookups are by hash on every authenticated request, and a key must map to at
-- most one agent.
DROP INDEX IF EXISTS idx_api_keys_hash;
CREATE UNIQUE INDEX idx_api_keys_hash ON api_keys(key_hash);

-- Lets a key be withdrawn without deleting the audit trail of its existence.
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;
