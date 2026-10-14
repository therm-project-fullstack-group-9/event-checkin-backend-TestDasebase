import type { Request, Response, NextFunction } from 'express';

// จำกัดจำนวนครั้งต่อ key ในหน้าต่างเวลา — เก็บในหน่วยความจำ เหมาะกับ server เครื่องเดียว
// key เริ่มต้น = IP + path; ส่ง keyFn เพื่อกำหนดเอง (เช่น แยกตามอีเมล ไม่ให้คนใน NAT เดียวกันบล็อกกันเอง)
export function rateLimit(max: number, windowMs: number, keyFn?: (req: Request) => string) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const key = keyFn ? keyFn(req) : `${req.ip}:${req.path}`;
    const entry = hits.get(key);

    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      // ล้างรายการที่หมดอายุเป็นครั้งคราว กัน Map โตไม่จำกัด
      if (hits.size > 5000) for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
      return next();
    }
    if (entry.count >= max) {
      res.setHeader('Retry-After', Math.ceil((entry.resetAt - now) / 1000));
      res.status(429).json({ message: 'พยายามบ่อยเกินไป กรุณาลองใหม่ภายหลัง' });
      return;
    }
    entry.count++;
    next();
  };
}
