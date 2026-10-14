// รัน: pnpm tsx scripts/auth-smoke.ts  (ต้อง db:push และ seed แล้ว) — ทดสอบ auth + การตรวจสิทธิ์แบบ end-to-end
import request from 'supertest';
import app from '../src/app.js';
import { db } from '../src/db/index.js';

let fail = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  -> ' + JSON.stringify(extra)}`);
  if (!ok) fail++;
};

(async () => {
  const email = `smoke-${Date.now()}@example.com`;
  const pw = 'longenough1';

  const reg = await request(app).post('/api/auth/register').send({ firstName: 'a', lastName: 'b', emailAddress: email, password: pw });
  check('register 201 + token, no passwordHash', reg.status === 201 && !!reg.body.token && !('passwordHash' in reg.body.user), reg.body);
  const dupReg = await request(app).post('/api/auth/register').send({ firstName: 'a', lastName: 'b', emailAddress: email, password: pw });
  check('register duplicate email 409', dupReg.status === 409, dupReg.body);
  const weak = await request(app).post('/api/auth/register').send({ firstName: 'a', lastName: 'b', emailAddress: 'x@y.com', password: '123' });
  check('register weak password 400', weak.status === 400, weak.body);

  const bad = await request(app).post('/api/auth/login').send({ emailAddress: email, password: 'wrong' });
  check('login wrong password 401', bad.status === 401, bad.body);
  const backdoor = await request(app).post('/api/auth/login').send({ emailAddress: email, password: '123456' });
  check('old backdoor password 123456 rejected', backdoor.status === 401, backdoor.body);
  const ok = await request(app).post('/api/auth/login').send({ emailAddress: email, password: pw });
  check('login ok returns token', ok.status === 200 && !!ok.body.token, ok.body);
  const token: string = ok.body.token;
  const auth = { Authorization: `Bearer ${token}` };

  check('no token -> 401', (await request(app).get('/api/profile')).status === 401);
  check('x-user-id header alone -> 401', (await request(app).get('/api/profile').set('x-user-id', 'whatever')).status === 401);
  check('garbage token -> 401', (await request(app).get('/api/profile').set('Authorization', 'Bearer abc.def.ghi')).status === 401);
  const prof = await request(app).get('/api/profile').set(auth);
  check('profile with token, no passwordHash', prof.status === 200 && !('passwordHash' in prof.body), prof.body);
  check('/api/auth/me works', (await request(app).get('/api/auth/me').set(auth)).status === 200);

  // สิทธิ์: ผู้ใช้ใหม่ไม่ใช่ผู้จัด/สตาฟของงานใดเลย
  const someEvent = await db.query.events.findFirst({ with: { bookings: true } });
  if (someEvent) {
    const dash = await request(app).get(`/api/events/${someEvent.eventId}/dashboard`).set(auth);
    check('dashboard of others event 403', dash.status === 403, dash.body);
    const put = await request(app).put(`/api/events/${someEvent.eventId}`).set(auth).send({ eventName: 'hacked' });
    check('edit others event 404 (not owner)', put.status === 404, put.body);
    const b = someEvent.bookings[0];
    if (b) {
      const ci = await request(app).post('/api/staff/check-in').set(auth).send({ ticketRef: b.ticketRef });
      check('check-in by non-staff 403', ci.status === 403, ci.body);
      const t = await request(app).get(`/api/tickets/${b.ticketRef}`).set(auth);
      check('view others ticket 403', t.status === 403, t.body);
    }
  }

  const noEmailOAuth = await request(app).get('/api/auth/cmu');
  check('oauth start without config -> 503', noEmailOAuth.status === 503, noEmailOAuth.status);
  const badState = await request(app).get('/api/auth/callback?code=x&state=bad');
  check('oauth callback bad state redirects to login error', badState.status === 302 && String(badState.headers.location).includes('/login?error='), badState.headers.location);

  console.log(fail ? `\n${fail} FAILED` : '\nALL PASSED');
  process.exit(fail ? 1 : 0);
})();
