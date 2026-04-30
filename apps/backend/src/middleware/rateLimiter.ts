import { Request, Response, NextFunction } from 'express';
import { config } from '../config';

const requestCounts = new Map<string, { count: number; resetTime: number }>();

export const rateLimiter = (req: Request, res: Response, next: NextFunction) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const key = `${ip}:${req.path}`;

  const now = Date.now();
  const windowMs = config.rateLimit.windowMs;

  let record = requestCounts.get(key);

  if (!record || now > record.resetTime) {
    record = { count: 0, resetTime: now + windowMs };
    requestCounts.set(key, record);
  }

  record.count++;

  if (record.count > config.rateLimit.maxRequests) {
    res.status(429).json({
      error: 'Too many requests',
      retryAfter: Math.ceil((record.resetTime - now) / 1000),
    });
    return;
  }

  res.setHeader('X-RateLimit-Limit', config.rateLimit.maxRequests.toString());
  res.setHeader('X-RateLimit-Remaining', (config.rateLimit.maxRequests - record.count).toString());
  res.setHeader('X-RateLimit-Reset', record.resetTime.toString());

  next();
};