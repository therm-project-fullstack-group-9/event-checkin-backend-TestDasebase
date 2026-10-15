// รัน: pnpm tsx scripts/event-lifecycle-test.ts (ต้อง db:push แล้ว)
// ทดสอบ: ซ่อน event ที่ Cancelled/Completed จากหน้าสาธารณะ, จอง event ที่ปิดแล้วไม่ได้, และลบ event (เฉพาะเจ้าของ + cascade)
import request from 'supertest';
import { eq } from 'drizzle-orm';
import app from '../src/app.js';
import { db } from '../src/db/index.js';
import { users, events, sessions, bookings } from '../src/db/schema.js';
import { signAccessToken } from '../src/auth/jwt.js';

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
    firstName: n, lastName: 'lc', emailAddress: `${n}-${tag}@x.com`,
    phoneNumber: String(3000000000 + (tag % 100000000) * 10 + i).slice(0, 10), passwordHash: 'x',
  });
  const [org, other, att] = await db.insert(users).values([mk('org', 0), mk('other', 1), mk('att', 2)]).returning();

  const mkEvent = async (name: string, status: string) => {
    const [ev] = await db.insert(events).values({
      eventName: name, shortDescription: 's', description: 'd', eventDate: bkk(30), venue: 'v',
      category: 'c', imageUrl: 'u', userId: org.userId, maxCapacity: 10, eventsStatus: status,
    }).returning();
    const [s] = await db.insert(sessions).values({ eventId: ev.eventId, startTime: '09:00', endTime: '12:00', capacity: 10 }).returning();
    return { ev, s };
  };
  const live = await mkEvent(`live-${tag}`, 'Upcoming');
  const cancelled = await mkEvent(`cancelled-${tag}`, 'Cancelled');
  const completed = await mkEvent(`completed-${tag}`, 'Completed');
  const ongoing = await mkEvent(`ongoing-${tag}`, 'Ongoing');

  // --- Cancelled ไม่ขึ้นหน้าสาธารณะ ---
  const list = await request(app).get('/api/events');
  const ids: string[] = list.body.map((e: { eventId: string }) => e.eventId);
  check('public list shows Upcoming event', ids.includes(live.ev.eventId));
  check('public list hides Cancelled event', !ids.includes(cancelled.ev.eventId));
  check('public list hides Completed event', !ids.includes(completed.ev.eventId));
  check('public list shows Ongoing event', ids.includes(ongoing.ev.eventId));
  const detail = await request(app).get(`/api/events/${cancelled.ev.eventId}`);
  check('detail of Cancelled event still readable (shows status)', detail.status === 200 && detail.body.eventsStatus === 'Cancelled', detail.body);

  // --- จอง event ที่ยกเลิกแล้วไม่ได้ ---
  const bookCancelled = await request(app).post('/api/bookings').set(bearer(att.userId)).send({ sessionId: cancelled.s.sessionId });
  check('cannot book Cancelled event -> 409 EVENT_CANCELLED', bookCancelled.status === 409 && bookCancelled.body.code === 'EVENT_CANCELLED', bookCancelled.body);
  const bookCompleted = await request(app).post('/api/bookings').set(bearer(att.userId)).send({ sessionId: completed.s.sessionId });
  check('cannot book Completed event -> 409 EVENT_COMPLETED', bookCompleted.status === 409 && bookCompleted.body.code === 'EVENT_COMPLETED', bookCompleted.body);
  const bookLive = await request(app).post('/api/bookings').set(bearer(att.userId)).send({ sessionId: live.s.sessionId });
  check('can still book normal event', bookLive.status === 201, bookLive.body);

  // --- my-bookings ส่งสถานะ event ให้ทุกบทบาท ---
  const mine = await request(app).get('/api/my-bookings').set(bearer(att.userId));
  const attCard = mine.body.find((i: { role: string; eventId: string }) => i.role === 'Attendee' && i.eventId === live.ev.eventId);
  check('my-bookings (Attendee) includes eventsStatus', attCard?.eventsStatus === 'Upcoming', attCard);
  const mineOrg = await request(app).get('/api/my-bookings').set(bearer(org.userId));
  const orgCard = mineOrg.body.find((i: { role: string; eventId: string }) => i.role === 'Organizer' && i.eventId === cancelled.ev.eventId);
  check('my-bookings (Organizer) includes eventsStatus', orgCard?.eventsStatus === 'Cancelled', orgCard);

  // --- ลบ event ---
  const noAuth = await request(app).delete(`/api/events/${live.ev.eventId}`);
  check('delete without token -> 401', noAuth.status === 401, noAuth.body);
  const byOther = await request(app).delete(`/api/events/${live.ev.eventId}`).set(bearer(other.userId));
  check('non-owner cannot delete -> 404', byOther.status === 404, byOther.body);
  const stillThere = await db.query.events.findFirst({ where: eq(events.eventId, live.ev.eventId) });
  check('event untouched after rejected delete', !!stillThere);

  const del = await request(app).delete(`/api/events/${live.ev.eventId}`).set(bearer(org.userId));
  check('owner deletes event -> 200', del.status === 200, del.body);
  const gone = await db.query.events.findFirst({ where: eq(events.eventId, live.ev.eventId) });
  check('event removed from DB', !gone);
  const orphanS = await db.select().from(sessions).where(eq(sessions.eventId, live.ev.eventId));
  const orphanB = await db.select().from(bookings).where(eq(bookings.eventId, live.ev.eventId));
  check('sessions and bookings cascade-deleted', orphanS.length === 0 && orphanB.length === 0, { s: orphanS.length, b: orphanB.length });
  const again = await request(app).delete(`/api/events/${live.ev.eventId}`).set(bearer(org.userId));
  check('delete twice -> 404', again.status === 404, again.body);

  // เก็บกวาดข้อมูลทดสอบ
  for (const e of [cancelled, completed, ongoing]) await db.delete(events).where(eq(events.eventId, e.ev.eventId));
  await db.delete(users).where(eq(users.userId, att.userId));
  await db.delete(users).where(eq(users.userId, other.userId));
  await db.delete(users).where(eq(users.userId, org.userId));

  console.log(fail ? `\n${fail} FAILED` : '\nALL PASSED');
  process.exit(fail ? 1 : 0);
})();
