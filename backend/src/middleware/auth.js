import jwt from 'jsonwebtoken';
import { getDb } from '../utils/db.js';

// Used by cron workers calling the API internally
export function requireCron(req, res, next) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    const ip = req.ip || req.connection?.remoteAddress || '';
    if (ip.includes('127.0.0.1') || ip.includes('::1') || ip.includes('localhost')) {
      return next();
    }
    return res.status(401).json({ error: 'Cron secret not configured' });
  }
  const provided = req.headers['x-cron-secret'];
  if (provided !== secret) {
    return res.status(401).json({ error: 'Invalid cron secret' });
  }
  next();
}

export function requireAdmin(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = auth.slice(7);
  try {
    const db = getDb();
    const secret = db.prepare("SELECT value FROM admin_settings WHERE key = 'admin_jwt_secret'").get()?.value;
    if (!secret) return res.status(500).json({ error: 'JWT secret not configured' });

    const payload = jwt.verify(token, secret);
    req.admin = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
