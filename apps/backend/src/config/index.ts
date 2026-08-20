import dotenv from 'dotenv';
dotenv.config();

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),

  corsOrigins: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3001'],

  database: {
    // Preferred: a single connection string, which is how Neon (and every
    // other managed Postgres) hands out credentials. The discrete fields below
    // remain for local docker-compose development, where there is no URL.
    url:
      process.env.DATABASE_URL ||
      process.env.POSTGRES_URL ||
      process.env.NEON_DATABASE_URL ||
      undefined,
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    name: process.env.DB_NAME || 'mogbank',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    // Managed Postgres requires TLS. Set DB_SSL=true when using the discrete
    // fields; a DATABASE_URL always connects with TLS.
    ssl: process.env.DB_SSL === 'true',
  },

  redis: {
    // No default: an unset REDIS_HOST means "no Redis", not "try localhost".
    // Local development sets it explicitly in .env.
    host: process.env.REDIS_HOST || undefined,
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  blockchain: {
    rpcUrl: process.env.ETH_RPC_URL || 'https://mainnet.base.org',
    chainId: parseInt(process.env.ETH_CHAIN_ID || '8453', 10),
    usdcAddress: process.env.USDC_ADDRESS || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  },

  x402: {
    enabled: process.env.X402_ENABLED === 'true',
    protocolFee: parseFloat(process.env.X402_PROTOCOL_FEE || '0.001'),
  },

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '60000', 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
  },

  faucet: {
    defaultAmount: parseFloat(process.env.FAUCET_DEFAULT_AMOUNT || '100'),
    dailyLimit: parseFloat(process.env.FAUCET_DAILY_LIMIT || '500'),
    usdcFaucet: process.env.FAUCET_USDC_ENABLED !== 'false',
  },

  ddsc: {
    enabled: process.env.DDSC_ENABLED === 'true',
    endpoint: process.env.DDSC_ENDPOINT || 'https://ddsc.mainnet.base.org',
    contractAddress: process.env.DDSC_CONTRACT || '0xDDSC',
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
};
