import { Router, type Request, type Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { loginSchema, registerSchema } from '../validators/zodValidators.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { signAccessToken, signOAuthState, verifyOAuthState } from '../auth/jwt.js';
import { requireAuth } from '../auth/middleware.js';
import { rateLimit } from '../auth/rateLimit.js';

const router = Router();

// ตัดฟิลด์ที่ห้ามส่งออกไปให้ client
const toSafeUser = <T extends { passwordHash?: string | null }>(user: T) => {
  const { passwordHash: _omit, ...safe } = user;
  return safe;
};

const isUniqueViolation = (err: unknown) =>
  (err as { code?: string })?.code === '23505' ||
  (err as { cause?: { code?: string } })?.cause?.code === '23505';

// ----------------------------------------------------------------------------
// สมัครสมาชิก
// ----------------------------------------------------------------------------
// กันเดารหัสผ่าน/สร้างบัญชีรัว: 10 ครั้ง ต่อ 15 นาที ต่อ IP
const authLimiter = rateLimit(10, 15 * 60 * 1000);

router.post('/register', authLimiter, async (req: Request, res: Response) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.issues[0].message, errors: parsed.error.flatten().fieldErrors });
    return;
  }
  const { firstName, lastName, emailAddress, phoneNumber, password } = parsed.data;

  try {
    const [created] = await db
      .insert(users)
      .values({
        firstName,
        lastName,
        emailAddress,
        phoneNumber: phoneNumber ?? null,
        passwordHash: await hashPassword(password),
        authProvider: 'local',
      })
      .returning();

    res.status(201).json({
      message: 'สมัครสมาชิกสำเร็จ!',
      token: signAccessToken(created.userId),
      user: toSafeUser(created),
    });
  } catch (error) {
    // ให้ unique constraint ของ DB เป็นตัวตัดสิน จึงไม่มี race ระหว่าง "เช็คก่อนแล้วค่อยสร้าง"
    if (isUniqueViolation(error)) {
      res.status(409).json({ message: 'อีเมลหรือเบอร์โทรศัพท์นี้ถูกใช้งานแล้ว' });
      return;
    }
    console.error(error);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการสมัครสมาชิก' });
  }
});

// ----------------------------------------------------------------------------
// เข้าสู่ระบบด้วยอีเมล/รหัสผ่าน
// ----------------------------------------------------------------------------
router.post('/login', authLimiter, async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.issues[0].message, errors: parsed.error.flatten().fieldErrors });
    return;
  }
  const { emailAddress, password } = parsed.data;

  try {
    const user = await db.query.users.findFirst({ where: eq(users.emailAddress, emailAddress) });

    // ข้อความเดียวกันทั้งกรณีไม่พบอีเมลและรหัสผิด เพื่อไม่ให้เดาได้ว่ามีอีเมลนี้ในระบบ
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      res.status(401).json({ message: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
      return;
    }

    res.json({
      message: 'เข้าสู่ระบบสำเร็จ!',
      token: signAccessToken(user.userId),
      user: toSafeUser(user),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ' });
  }
});

// ผู้ใช้ปัจจุบันจาก token (frontend ใช้ตรวจว่า token ยังใช้ได้ตอนเปิดหน้าเว็บ)
router.get('/me', requireAuth, async (req: Request, res: Response) => {
  const user = await db.query.users.findFirst({ where: eq(users.userId, req.userId!) });
  if (!user) {
    res.status(401).json({ message: 'ไม่พบผู้ใช้งานนี้แล้ว' });
    return;
  }
  res.json(toSafeUser(user));
});

// ----------------------------------------------------------------------------
// CMU Mock OAuth (Authorization Code flow)
// ----------------------------------------------------------------------------
const oauthConfig = () => ({
  authorizeUrl: process.env.OAUTH_AUTHORIZE_URL ?? 'https://oauth497.cpecmu.com/application/o/authorize/',
  tokenUrl: process.env.OAUTH_TOKEN_URL ?? 'https://oauth497.cpecmu.com/application/o/token/',
  userinfoUrl: process.env.OAUTH_USERINFO_URL ?? 'https://oauth497.cpecmu.com/application/o/userinfo/',
  clientId: process.env.OAUTH_CLIENT_ID ?? '',
  clientSecret: process.env.OAUTH_CLIENT_SECRET ?? '',
  redirectUri: process.env.OAUTH_REDIRECT_URI ?? '',
  scope: process.env.OAUTH_SCOPE ?? 'openid profile email basic_info',
  frontendUrl: (process.env.FRONTEND_URL ?? 'http://localhost:5173').replace(/\/$/, ''),
});

// 1) frontend ส่งผู้ใช้มาที่นี่ -> redirect ไปหน้าล็อกอินของ OAuth
router.get('/cmu', (_req: Request, res: Response) => {
  const cfg = oauthConfig();
  if (!cfg.clientId || !cfg.clientSecret || !cfg.redirectUri) {
    res.status(503).json({ message: 'ยังไม่ได้ตั้งค่า OAuth (OAUTH_CLIENT_ID / OAUTH_CLIENT_SECRET / OAUTH_REDIRECT_URI)' });
    return;
  }
  const url = new URL(cfg.authorizeUrl);
  url.search = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: 'code',
    scope: cfg.scope,
    state: signOAuthState(),
  }).toString();
  res.redirect(url.toString());
});

type OAuthProfile = Record<string, unknown>;

// อ่าน claims จาก id_token (ได้รับตรงจาก token endpoint ผ่าน TLS จึงไม่ต้อง verify ลายเซ็นซ้ำ)
function decodeIdToken(idToken: unknown): OAuthProfile | null {
  if (typeof idToken !== 'string') return null;
  const payload = idToken.split('.')[1];
  if (!payload) return null;
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

// 2) OAuth redirect กลับมาที่นี่ -> แลก code เป็น token -> ออก JWT ของระบบ -> ส่งกลับ frontend
router.get('/callback', async (req: Request, res: Response) => {
  const cfg = oauthConfig();
  const fail = (reason: string) => res.redirect(`${cfg.frontendUrl}/login?error=${encodeURIComponent(reason)}`);

  const code = str(req.query.code);
  const state = str(req.query.state);
  if (!code || !state || !verifyOAuthState(state)) {
    fail('oauth_invalid_state');
    return;
  }

  try {
    const tokenRes = await fetch(cfg.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        code,
        redirect_uri: cfg.redirectUri,
      }),
    });
    if (!tokenRes.ok) {
      console.error('OAuth token exchange failed:', tokenRes.status);
      fail('oauth_token_failed');
      return;
    }
    const tokenBody = (await tokenRes.json()) as Record<string, unknown>;

    // ลองอ่านจาก id_token ก่อน ถ้าไม่มีอีเมลค่อยเรียก userinfo
    let profile = decodeIdToken(tokenBody.id_token);
    if (!str(profile?.email) && str(tokenBody.access_token)) {
      const infoRes = await fetch(cfg.userinfoUrl, {
        headers: { Authorization: `Bearer ${tokenBody.access_token}` },
      });
      if (infoRes.ok) profile = (await infoRes.json()) as OAuthProfile;
    }

    const email = str(profile?.email)?.toLowerCase();
    if (!profile || !email) {
      fail('oauth_no_email');
      return;
    }

    // หา user จากอีเมล ถ้ายังไม่มีให้สร้างใหม่ (ไม่มีรหัสผ่าน ล็อกอินได้เฉพาะผ่าน OAuth)
    let user = await db.query.users.findFirst({ where: eq(users.emailAddress, email) });
    if (!user) {
      const fullName = str(profile.name) ?? '';
      const [first, ...rest] = fullName.split(/\s+/).filter(Boolean);
      [user] = await db
        .insert(users)
        .values({
          emailAddress: email,
          firstName: str(profile.given_name) ?? first ?? email.split('@')[0],
          lastName: str(profile.family_name) ?? (rest.join(' ') || '-'),
          authProvider: 'cmu',
        })
        .returning();
    }

    // token อยู่ใน fragment (#) เพื่อไม่ให้ติดไปใน log ของ server/proxy
    res.redirect(`${cfg.frontendUrl}/auth/callback#token=${signAccessToken(user.userId)}`);
  } catch (error) {
    console.error('OAuth callback error:', error);
    fail('oauth_failed');
  }
});

export default router;
