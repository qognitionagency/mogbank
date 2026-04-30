import { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { logger } from '../utils/logger';
import { z } from 'zod';

const apiKeySchema = z.object({
  'x-api-key': z.string().optional(),
  authorization: z.string().optional(),
});

export interface AuthenticatedRequest extends Request {
  agentId?: string;
  walletAddress?: string;
  apiKey?: string;
}

export const authMiddleware = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const validation = apiKeySchema.safeParse({
      'x-api-key': req.headers['x-api-key'],
      authorization: req.headers.authorization,
    });

    if (!validation.success) {
      return res.status(401).json({ error: 'Invalid authentication headers' });
    }

    const apiKey = req.headers['x-api-key'] as string;
    const authHeader = req.headers.authorization as string;

    if (apiKey) {
      req.apiKey = apiKey;
      next();
      return;
    }

    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      // TODO: Implement JWT verification
      // const decoded = jwt.verify(token, config.jwt.secret);
      // req.agentId = decoded.agentId;
      logger.debug('JWT authentication (stub)', { token: token.substring(0, 10) + '...' });
      next();
      return;
    }

    res.status(401).json({ error: 'Authentication required' });
  } catch (error) {
    logger.error('Auth middleware error', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
};

export const optionalAuthMiddleware = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const apiKey = req.headers['x-api-key'] as string;
  const authHeader = req.headers.authorization as string;

  if (apiKey) {
    req.apiKey = apiKey;
  } else if (authHeader?.startsWith('Bearer ')) {
    req.apiKey = authHeader.substring(7);
  }

  next();
};