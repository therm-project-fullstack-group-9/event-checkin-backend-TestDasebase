// รัน: pnpm tsx scripts/quota-test.ts (ต้อง db:push แล้ว) — ทดสอบกฎโควตา/ไม่มาตามรอบ และการมอบหมายสตาฟ
import request from 'supertest';
import { eq } from 'drizzle-orm';
import app from '../src/app.js';
import { db } from '../src/db/index.js';
import { users, events, sessions, bookings } from '../src/db/schema.js';
import { signAccessToken } from '../src/auth/jwt.js';
import { markOverdueNoShows } from '../src/services/noShow.js';

let fail = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  -> ' + JSON.stringify(extra)}`);
  if (!ok) fail++;
};
const bearer = (id: string) => ({ Authorization: 'Bearer ' + signAccessToken(id) });
const bkk = (offsetDays: number) =>
  new Date(Date.now() + offsetDays * 86400000).toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' });

(async () => {
  const tag = Date.now();
  const mk = (n: string, i: number) => ({
    firstName: n, lastName: 'q', emailAddress: `${n}-${tag}@x.com`,
    phoneNumber: String(2000000000 + (tag % 100000000) * 10 + i).slice(0, 10), passwordHash: 'x',
  });
  const [org, late, other, staff] = await db.insert(users).values([mk('org', 0), mk('late', 1), mk('other', 2), mk('staff', 3)]).returning();

  const mkEvent = async (date: string, start: string, end: string, name: string) => {
    const [ev] = await db.insert(events).values({
      eventName: name, shortDescription: 's', description: 'd', eventDate: date, venue: 'v',
      category: 'c', imageUrl: 'u', userId: org.userId, maxCapacity: 10,
    }).returning();
    const [s] = await db.insert(sessions).values({ eventId: ev.eventId, startTime: start, endTime: end, capacity: 10 }).returning();
    return { ev, s };
  };
  const past = await mkEvent(bkk(-2), '09:00', '12:00', 'past');
  const pastB = await mkEvent(bkk(-2), '13:00', '16:00', 'past-b');
  const live = await mkEvent(bkk(0), '00:00', '23:59', 'live-today');
  const future = await mkEvent(bkk(30), '09:00', '12:00', 'future');

  const insertBooking = async (userId: string, e: { ev: { eventId: string }; s: { sessionId: string } }, ref: string) =>
    (await db.insert(bookings).values({ ticketRef: ref + tag, userId, eventId: e.ev.eventId, sessionId: e.s.sessionId }).returning())[0];

  // --- ไม่มาตามรอบ -> สแกนไม่ได้ ---
  const bPast = await insertBooking(late.userId, past, 'P1-');
  const ci = await request(app).post('/api/staff/check-in').set(bearer(org.userId)).send({ ticketRef: bPast.ticketRef });
  check('check-in after session end -> 403 SESSION_ENDED', ci.status === 403 && ci.body.code === 'SESSION_ENDED', ci.body);
  const [afterCi] = await db.select().from(bookings).where(eq(bookings.bookingId, bPast.bookingId));
  check('booking auto-marked NO_SHOW', afterCi.bookingStatus === 'NO_SHOW', afterCi.bookingStatus);
  const ci2 = await request(app).post('/api/staff/check-in').set(bearer(org.userId)).send({ ticketRef: bPast.ticketRef });
  check('check-in again still 403 NO_SHOW', ci2.status === 403 && ci2.body.code === 'NO_SHOW', ci2.body);

  // --- ไม่มาตามรอบ -> จองใหม่ไม่ได้ ---
  const blocked = await request(app).post('/api/bookings').set(bearer(late.userId)).send({ sessionId: future.s.sessionId });
  check('no-show user cannot book -> 403 BOOKING_BLOCKED', blocked.status === 403 && blocked.body.code === 'BOOKING_BLOCKED', blocked.body);
  const prof = await request(app).get('/api/profile').set(bearer(late.userId));
  check('profile shows bookingBlocked', prof.body.bookingBlocked === true && prof.body.noShowCount === 1, prof.body);

  // --- lazy: ไม่มี sweep มาก่อน แต่พอจองก็ตรวจและบล็อกเอง ---
  const lazy = await insertBooking(other.userId, pastB, 'P2-');
  const lazyTry = await request(app).post('/api/bookings').set(bearer(other.userId)).send({ sessionId: future.s.sessionId });
  check('lazy detection blocks booking without sweep', lazyTry.status === 403, lazyTry.body);
  const [lz] = await db.select().from(bookings).where(eq(bookings.bookingId, lazy.bookingId));
  check('lazy detection marked NO_SHOW', lz.bookingStatus === 'NO_SHOW', lz.bookingStatus);

  // --- คนปกติจองได้ แต่จองรอบที่จบแล้วไม่ได้ ---
  const [clean] = await db.insert(users).values(mk('clean', 4)).returning();
  const endedTry = await request(app).post('/api/bookings').set(bearer(clean.userId)).send({ sessionId: past.s.sessionId });
  check('cannot book an ended session -> 400', endedTry.status === 400, endedTry.body);
  const okBook = await request(app).post('/api/bookings').set(bearer(clean.userId)).send({ sessionId: future.s.sessionId });
  check('normal user can book future session', okBook.status === 201, okBook.body);

  // --- เช็คอินในรอบที่ยังไม่จบ ผ่านได้ + กฎสตาฟ ---
  const okRes = await request(app).post('/api/bookings').set(bearer(clean.userId)).send({ sessionId: live.s.sessionId });
  check('book session running today', okRes.status === 201, okRes.body);
  const ref: string = okRes.body.booking?.ticketRef;
  const denied = await request(app).post('/api/staff/check-in').set(bearer(staff.userId)).send({ ticketRef: ref });
  check('non-staff cannot check in', denied.status === 403, denied.body);
  const add = await request(app).post(`/api/events/${live.ev.eventId}/staff`).set(bearer(org.userId)).send({ emailAddress: staff.emailAddress });
  check('organizer adds staff 201', add.status === 201, add.body);
  const addDup = await request(app).post(`/api/events/${live.ev.eventId}/staff`).set(bearer(org.userId)).send({ emailAddress: staff.emailAddress });
  check('add staff twice -> 409', addDup.status === 409, addDup.body);
  const addByOther = await request(app).post(`/api/events/${live.ev.eventId}/staff`).set(bearer(other.userId)).send({ emailAddress: staff.emailAddress });
  check('non-organizer cannot add staff -> 403', addByOther.status === 403, addByOther.body);
  const okCi = await request(app).post('/api/staff/check-in').set(bearer(staff.userId)).send({ ticketRef: ref });
  check('assigned staff can check in a live session', okCi.status === 200 && okCi.body.status === 'success', okCi.body);
  const again = await request(app).post('/api/staff/check-in').set(bearer(staff.userId)).send({ ticketRef: ref });
  check('second scan rejected', again.status === 400, again.body);
  const rm = await request(app).delete(`/api/events/${live.ev.eventId}/staff/${staff.userId}`).set(bearer(org.userId));
  check('organizer removes staff', rm.status === 200, rm.body);

  // --- sweep ทั้งระบบ ---
  const sw = await insertBooking(clean.userId, past, 'P3-');
  const n = await markOverdueNoShows();
  const [swRow] = await db.select().from(bookings).where(eq(bookings.bookingId, sw.bookingId));
  check('global sweep marks overdue', n >= 1 && swRow.bookingStatus === 'NO_SHOW', { n, s: swRow.bookingStatus });

  console.log(fail ? `\n${fail} FAILED` : '\nALL PASSED');
  process.exit(fail ? 1 : 0);
})();
