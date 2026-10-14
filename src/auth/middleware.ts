import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from './jwt.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** id ของผู้ใช้ที่ล็อกอิน (ตั้งค่าโดย requireAuth) */
      userId?: string;
    }
  }
}

// ต้องแนบ header: Authorization: Bearer <token>
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;
  const userId = token ? verifyAccessToken(token) : null;

  if (!userId) {
    res.status(401).json({ message: 'กรุณาเข้าสู่ระบบ' });
    return;
  }
  req.userId = userId;
  next();
}
