import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { bookings, sessions, events } from '../db/schema.js';
import { hasSessionEnded } from '../lib/eventTime.js';

// จำนวนครั้งที่ไม่มาตามรอบ (NO_SHOW) ที่ทำให้ถูกระงับการจอง (ตั้งค่าได้ด้วย env, อย่างน้อย 1)
export const noShowLimit = () => Math.max(1, Number(process.env.NO_SHOW_LIMIT ?? 1) || 1);

/**
 * เปลี่ยนตั๋วที่ยัง CONFIRMED แต่รอบเวลาสิ้นสุดไปแล้ว ให้เป็น NO_SHOW
 * ใช้ได้ 2 แบบ: ระบุ userId/bookingId เพื่อเช็คเฉพาะราย (เรียกก่อนจอง/สแกน)
 * หรือไม่ระบุเลยเพื่อกวาดทั้งระบบ (งานรันเป็นระยะใน index.ts) — คืนจำนวนที่เปลี่ยน
 */
export async function markOverdueNoShows(filter: { userId?: string; bookingId?: string } = {}, now = new Date()) {
  const conditions = [
    eq(bookings.bookingStatus, 'CONFIRMED'),
    // ตัดงานที่ยังไม่ถึงวันออกก่อนเพื่อลดจำนวนแถวที่ต้องตรวจ
    sql`${events.eventDate} <= (now() at time zone 'Asia/Bangkok')::date + 1`,
  ];
  if (filter.userId) conditions.push(eq(bookings.userId, filter.userId));
  if (filter.bookingId) conditions.push(eq(bookings.bookingId, filter.bookingId));

  const candidates = await db
    .select({
      bookingId: bookings.bookingId,
      eventDate: events.eventDate,
      startTime: sessions.startTime,
      endTime: sessions.endTime,
    })
    .from(bookings)
    .innerJoin(sessions, eq(bookings.sessionId, sessions.sessionId))
    .innerJoin(events, eq(bookings.eventId, events.eventId))
    .where(and(...conditions));

  const overdueIds = candidates
    .filter((c) => hasSessionEnded(c.eventDate, c.startTime, c.endTime, now))
    .map((c) => c.bookingId);
  if (overdueIds.length === 0) return 0;

  // เงื่อนไข status = CONFIRMED ซ้ำอีกชั้น กันชนกับคนที่เพิ่งสแกนเข้าพอดี
  const updated = await db
    .update(bookings)
    .set({ bookingStatus: 'NO_SHOW', updateBookingDate: now })
    .where(and(inArray(bookings.bookingId, overdueIds), eq(bookings.bookingStatus, 'CONFIRMED')))
    .returning({ bookingId: bookings.bookingId });
  return updated.length;
}

/** สถานะการถูกระงับสิทธิ์จองของผู้ใช้ (ตรวจและอัปเดต NO_SHOW ที่ค้างของผู้ใช้นี้ก่อนนับ) */
export async function getBookingRestriction(userId: string) {
  await markOverdueNoShows({ userId });
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(bookings)
    .where(and(eq(bookings.userId, userId), eq(bookings.bookingStatus, 'NO_SHOW')));
  const noShowCount = row?.count ?? 0;
  const limit = noShowLimit();
  return { noShowCount, noShowLimit: limit, bookingBlocked: noShowCount >= limit };
}
