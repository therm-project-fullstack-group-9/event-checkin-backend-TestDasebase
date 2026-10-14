import jwt from 'jsonwebtoken';

const isProd = process.env.NODE_ENV === 'production';

// อ่านตอนใช้งานจริง (ไม่ใช่ตอน import) เพื่อให้ dotenv โหลดเสร็จก่อน
function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret) return secret;
  if (isProd) throw new Error('JWT_SECRET must be set in production');
  // ใช้ได้เฉพาะตอนพัฒนา/ทดสอบ — ห้ามใช้ค่านี้บน server จริง
  return 'dev-only-insecure-secret-change-me';
}

const ACCESS_TOKEN_TTL = '7d';

export const signAccessToken = (userId: string) =>
  jwt.sign({ sub: userId, typ: 'access' }, getSecret(), { expiresIn: ACCESS_TOKEN_TTL });

// state ของ OAuth: อายุสั้น ใช้กัน CSRF โดยไม่ต้องเก็บ session ฝั่ง server
export const signOAuthState = () => jwt.sign({ typ: 'oauth_state' }, getSecret(), { expiresIn: '10m' });

export const verifyOAuthState = (state: string): boolean => {
  try {
    const payload = jwt.verify(state, getSecret()) as jwt.JwtPayload;
    return payload.typ === 'oauth_state';
  } catch {
    return false;
  }
};

// คืน userId ถ้า token ถูกต้องและเป็น access token, ไม่เช่นนั้น null
export const verifyAccessToken = (token: string): string | null => {
  try {
    const payload = jwt.verify(token, getSecret()) as jwt.JwtPayload;
    if (payload.typ !== 'access' || typeof payload.sub !== 'string') return null;
    return payload.sub;
  } catch {
    return null;
  }
};
