import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { randomBytes } from 'node:crypto';
import { eq, sql, asc, and, ne } from 'drizzle-orm';
import { db } from './db/index.js';
import { users, events, sessions, bookings, checkInLogs, eventStaffs } from './db/schema.js';
import { createEventSchema, updateProfileSchema } from './validators/zodValidators.js';
import authRouter from './routes/auth.js';
import { requireAuth } from './auth/middleware.js';
import staffRouter from './routes/staff.js';
import { hasSessionEnded } from './lib/eventTime.js';
import { markOverdueNoShows, getBookingRestriction } from './services/noShow.js';

const app = express();

// อยู่หลัง nginx: ให้ req.ip เป็น IP ผู้ใช้จริง (ใช้กับ rate limit)
app.set('trust proxy', 1);

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
// app.use(express.json());
app.use(express.json({ limit: '10mb' }));

// Auth: /api/auth/register, /login, /me, /cmu, /callback
app.use('/api/auth', authRouter);

// จัดการสตาฟของกิจกรรม: /api/events/:id/staff
app.use('/api/events', staffRouter);

// ผู้จัดงานหรือสตาฟของงานนี้หรือไม่ (ใช้ตรวจสิทธิ์สแกนเช็คอินและดูรายชื่อ)
async function isOrganizerOrStaff(userId: string, eventId: string) {
  const event = await db.query.events.findFirst({ where: eq(events.eventId, eventId) });
  if (!event) return { exists: false, organizer: false, staff: false };
  if (event.userId === userId) return { exists: true, organizer: true, staff: false };
  const staff = await db.query.eventStaffs.findFirst({
    where: and(eq(eventStaffs.userId, userId), eq(eventStaffs.eventId, eventId)),
  });
  return { exists: true, organizer: false, staff: !!staff };
}

// เช็คสถานะเซิร์ฟเวอร์
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', message: 'EventsCheckIN Backend is running! 🚀' });
});

// API ดึงรายการกิจกรรมทั้งหมด (ใช้ในหน้า ExploreEvents)
app.get('/api/events', async (req: Request, res: Response) => {
  try {
    const allEvents = await db.query.events.findMany({
      with: {
        sessions: {
          orderBy: [asc(sessions.startTime)],
        },
        organizer: {
          columns: {
            firstName: true,
            lastName: true,
          },
        },
      },
    });
    res.json(allEvents);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'ไม่สามารถดึงข้อมูลกิจกรรมได้' });
  }
});

// API ดึงรายละเอียดกิจกรรมตาม ID (ใช้ในหน้า EventDetails)
app.get('/api/events/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const event = await db.query.events.findFirst({
      where: eq(events.eventId, String(id)),
      with: {
        sessions: {
          orderBy: [asc(sessions.startTime)],
        },
        organizer: {
          columns: {
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!event) {
      res.status(404).json({ message: 'ไม่พบกิจกรรมนี้' });
      return;
    }

    res.json(event);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการดึงรายละเอียดกิจกรรม' });
  }
});

// API สำหรับสตาฟฟ์สแกน QR Code เช็คอิน (ใช้ในหน้า StaffScanner)
app.post('/api/staff/check-in', requireAuth, async (req: Request, res: Response) => {
  try {
    const { ticketRef } = req.body;

    // ค้นหาตั๋วพร้อมข้อมูลผู้จองและชื่องาน
    const booking = await db.query.bookings.findFirst({
      where: eq(bookings.ticketRef, ticketRef),
      with: {
        user: true,
        event: true,
        session: true,
      },
    });

    if (!booking) {
      res.status(404).json({ status: 'error', message: `ไม่พบรหัสตั๋ว (${ticketRef}) ในระบบ` });
      return;
    }

    // เฉพาะผู้จัดงานหรือสตาฟที่ถูกมอบหมายให้งานนี้เท่านั้นที่สแกนได้
    const role = await isOrganizerOrStaff(req.userId!, booking.eventId);
    if (!role.organizer && !role.staff) {
      res.status(403).json({ status: 'error', message: 'คุณไม่มีสิทธิ์เช็คอินของกิจกรรมนี้' });
      return;
    }

    // กฎโควตาอัตโนมัติ: เลยเวลาสิ้นสุดของรอบแล้วยังไม่ได้เช็คอิน = ไม่มาตามรอบ (NO_SHOW) สแกนเข้าไม่ได้
    if (booking.bookingStatus === 'CONFIRMED' &&
        hasSessionEnded(booking.event.eventDate, booking.session.startTime, booking.session.endTime)) {
      await markOverdueNoShows({ bookingId: booking.bookingId });
      res.status(403).json({
        status: 'error',
        code: 'SESSION_ENDED',
        message: `หมดเวลาเช็คอินของรอบนี้แล้ว ตั๋ว (${ticketRef}) ถูกบันทึกว่าไม่มาตามรอบ`,
        ticketRef: booking.ticketRef,
        attendee: `${booking.user.firstName} ${booking.user.lastName}`,
        eventTitle: booking.event.eventName,
      });
      return;
    }
    if (booking.bookingStatus === 'NO_SHOW') {
      res.status(403).json({
        status: 'error',
        code: 'NO_SHOW',
        message: `ตั๋ว (${ticketRef}) ถูกบันทึกว่าไม่มาตามรอบ ไม่สามารถเช็คอินได้`,
        ticketRef: booking.ticketRef,
        attendee: `${booking.user.firstName} ${booking.user.lastName}`,
        eventTitle: booking.event.eventName,
      });
      return;
    }
    if (booking.bookingStatus === 'CANCELLED') {
      res.status(400).json({ status: 'error', message: `ตั๋ว (${ticketRef}) ถูกยกเลิกแล้ว` });
      return;
    }

    // กรณีตั๋วถูกเช็คอินไปแล้ว -> ดึงเวลา checkInTime เดิมที่เคยบันทึกไว้ใน DB ส่งกลับไปให้หน้าเว็บด้วย
    // booking.checkInTime ส่งเวลาที่เคยเช็คอินจริงจากฐานข้อมูลกลับไป
    if (booking.bookingStatus === 'CHECKED_IN') {
      res.status(400).json({ 
        status: 'error', 
        message: `ตั๋วใบนี้ (${ticketRef}) ถูกสแกนเข้างานไปแล้ว!`,
        ticketRef: booking.ticketRef,
        attendee: `${booking.user.firstName} ${booking.user.lastName}`,
        eventTitle: booking.event.eventName,
        checkInTime: booking.checkInTime,
      });
      return;
    }

    // เช็คอินแบบ atomic ใน transaction: อัปเดตเฉพาะตั๋วที่ยัง CONFIRMED
    // ถ้าแอดมิน 2 คนสแกนพร้อมกัน จะมีคนเดียวที่ update สำเร็จ ไม่เกิด log ซ้ำ
    const now = new Date();
    const updatedBooking = await db.transaction(async (tx) => {
      const [row] = await tx.update(bookings)
        .set({ bookingStatus: 'CHECKED_IN', checkInTime: now, updateBookingDate: now })
        .where(and(eq(bookings.bookingId, booking.bookingId), eq(bookings.bookingStatus, 'CONFIRMED')))
        .returning();
      if (!row) return null;

      await tx.insert(checkInLogs).values({
        bookingId: booking.bookingId,
        userId: req.userId!, // คนที่สแกนจริง (staff/organizer)
        ticketRef: booking.ticketRef,
        actionType: 'IN',
        timestamp: now,
      });
      return row;
    });

    if (!updatedBooking) {
      res.status(409).json({
        status: 'error',
        message: `ตั๋วใบนี้ (${ticketRef}) ไม่อยู่ในสถานะที่เช็คอินได้ หรือถูกสแกนไปแล้ว`,
      });
      return;
    }

    res.json({
      status: 'success',
      message: 'เช็คอินสำเร็จ! อนุญาตให้เข้างาน',
      ticketRef: booking.ticketRef,
      attendee: `${booking.user.firstName} ${booking.user.lastName}`,
      eventTitle: booking.event.eventName,
      checkInTime: updatedBooking.checkInTime,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ status: 'error', message: 'เกิดข้อผิดพลาดที่ระบบหลังบ้าน' });
  }
});

// Error สำหรับ business rule ที่เกิดใน transaction (ทำให้ rollback แล้วแปลงเป็น HTTP status)
class BookingError extends Error {
  constructor(public status: number, message: string, public extra: Record<string, unknown> = {}) {
    super(message);
  }
}

// รหัสพื้นฐานของ Postgres: 23505 = unique_violation
const isUniqueViolation = (err: unknown) =>
  (err as { code?: string; cause?: { code?: string } })?.code === '23505' ||
  (err as { cause?: { code?: string } })?.cause?.code === '23505';

// สร้างรหัสตั๋วด้วย crypto (Math.random ไม่ปลอดภัยและชนกันได้ง่าย) เช่น EVT-A1B2C3
const generateTicketRef = () => `EVT-${randomBytes(4).toString('hex').toUpperCase()}`;

// API สำหรับกดจองตั๋วเข้าร่วมกิจกรรม (ใช้ในหน้า EventDetails)
// แก้ Race Condition: ตรวจที่นั่ง + เพิ่ม booked + สร้างใบจอง ทำใน transaction เดียว
// โดยใช้ atomic UPDATE ... WHERE booked < capacity ทำให้ตั๋วใบสุดท้ายถูกจองได้เพียงคนเดียว
app.post('/api/bookings', requireAuth, async (req: Request, res: Response) => {
  try {
    const { sessionId, healthDeclaration } = req.body;

    if (!sessionId) {
      res.status(400).json({ message: 'กรุณาระบุรอบเวลาที่ต้องการจอง' });
      return;
    }

    const currentUserId = req.userId!;

    // กฎโควตาอัตโนมัติ: ผู้ที่เคยไม่มาตามรอบจนครบเกณฑ์ จะจองตั๋วใหม่ไม่ได้
    const restriction = await getBookingRestriction(currentUserId);
    if (restriction.bookingBlocked) {
      res.status(403).json({
        code: 'BOOKING_BLOCKED',
        message: `คุณถูกระงับสิทธิ์การจองตั๋ว เนื่องจากไม่มาเข้าร่วมตามรอบที่จองไว้ ${restriction.noShowCount} ครั้ง`,
        noShowCount: restriction.noShowCount,
      });
      return;
    }

    // จองรอบที่สิ้นสุดไปแล้วไม่ได้
    const target = await db.query.sessions.findFirst({
      where: eq(sessions.sessionId, sessionId),
      with: { event: true },
    });
    if (target && hasSessionEnded(target.event.eventDate, target.startTime, target.endTime)) {
      res.status(400).json({ message: 'รอบเวลานี้สิ้นสุดไปแล้ว ไม่สามารถจองได้' });
      return;
    }

    const newBooking = await db.transaction(async (tx) => {
      // 1. จองที่นั่งแบบ atomic: เพิ่ม booked ได้ก็ต่อเมื่อยังไม่เต็มเท่านั้น
      //    Postgres จะ lock แถวนี้ ทำให้ request ที่มาพร้อมกันต้องรอคิวและเห็นค่าล่าสุดเสมอ
      const [reserved] = await tx
        .update(sessions)
        .set({ booked: sql`${sessions.booked} + 1` })
        .where(and(eq(sessions.sessionId, sessionId), sql`${sessions.booked} < ${sessions.capacity}`))
        .returning({ sessionId: sessions.sessionId, eventId: sessions.eventId });

      if (!reserved) {
        // update ไม่โดนแถวใด = ไม่มีรอบนี้ หรือ เต็มแล้ว -> แยกกรณีเพื่อตอบ error ให้ถูก
        const exists = await tx.query.sessions.findFirst({ where: eq(sessions.sessionId, sessionId) });
        if (!exists) throw new BookingError(404, 'ไม่พบรอบเวลานี้ในระบบ');
        throw new BookingError(409, 'ขออภัย รอบเวลานี้ที่นั่งเต็มแล้ว!');
      }

      // 2. กันจองซ้ำรอบเดิม (ข้ามใบที่ CANCELLED) — ถ้า throw จะ rollback การเพิ่ม booked ให้เอง
      const existingBooking = await tx.query.bookings.findFirst({
        where: and(
          eq(bookings.userId, currentUserId),
          eq(bookings.sessionId, sessionId),
          ne(bookings.bookingStatus, 'CANCELLED'),
        ),
      });
      if (existingBooking) {
        throw new BookingError(
          409,
          `คุณได้จองตั๋วของรอบเวลานี้ไปแล้ว! (รหัสตั๋วของคุณคือ: ${existingBooking.ticketRef})`,
          { ticketRef: existingBooking.ticketRef },
        );
      }

      // 3. บันทึกใบจอง — ใช้ eventId จาก session ใน DB ไม่เชื่อ eventId ที่ client ส่งมา
      const [created] = await tx.insert(bookings).values({
        ticketRef: generateTicketRef(),
        userId: currentUserId,
        eventId: reserved.eventId,
        sessionId,
        bookingStatus: 'CONFIRMED',
        healthDeclaration: healthDeclaration || 'ปกติ',
      }).returning();

      return created;
    });

    res.status(201).json({
      message: 'จองตั๋วสำเร็จ!',
      booking: newBooking,
    });
  } catch (error) {
    if (error instanceof BookingError) {
      res.status(error.status).json({ message: error.message, ...error.extra });
      return;
    }
    // unique index (user_id, session_id) กันกรณี 2 request จองซ้ำพร้อมกัน
    if (isUniqueViolation(error)) {
      res.status(409).json({ message: 'คุณได้จองตั๋วของรอบเวลานี้ไปแล้ว!' });
      return;
    }
    console.error(error);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการจองตั๋ว' });
  }
});

// API ดึงข้อมูลกิจกรรมของฉันครบทุกบทบาท: Attendee, Organizer, Staff (ใช้ในหน้า MyEvents)
app.get('/api/my-bookings', requireAuth, async (req: Request, res: Response) => {
  try {
    const currentUserId = req.userId!;

    // 1. ดึงรายการตั๋วที่จองไว้ (บทบาท Attendee)
    const userBookings = await db.query.bookings.findMany({
      where: eq(bookings.userId, currentUserId),
      with: {
        event: true,
        session: true,
      },
    });

    // 2. ดึงรายการอีเวนต์ที่ User คนนี้เป็นผู้จัดงาน (บทบาท Organizer)
    const organizedEvents = await db.query.events.findMany({
      where: eq(events.userId, currentUserId),
    });

    // 3. ดึงรายการอีเวนต์ที่ User คนนี้เป็นสตาฟฟ์ (บทบาท Staff)
    const staffAssignments = await db.query.eventStaffs.findMany({
      where: eq(eventStaffs.userId, currentUserId),
      with: {
        event: true,
      },
    });

    // รวมข้อมูลส่งกลับไปให้ Frontend แสดงผลตามการ์ดแต่ละประเภท
    const formattedItems = [
      // การ์ดฝั่ง Attendee (ตั๋วที่มี)
      ...userBookings.map((b) => ({
        id: `attendee-${b.bookingId}`,
        eventId: b.event.eventId,
        title: b.event.eventName,
        date: b.event.eventDate,
        sessionTime: `${b.session.startTime} - ${b.session.endTime} น.`,
        venue: b.event.venue,
        imageUrl: b.event.imageUrl,
        role: 'Attendee' as const,
        ticketRef: b.ticketRef,
        
        bookingStatus: b.bookingStatus,
      })),
      // การ์ดฝั่ง Organizer (งานที่ฉันสร้าง)
      ...organizedEvents.map((e) => ({
        id: `organizer-${e.eventId}`,
        eventId: e.eventId,
        title: e.eventName,
        date: e.eventDate,
        venue: e.venue,
        imageUrl: e.imageUrl,
        role: 'Organizer' as const,
      })),
      // การ์ดฝั่ง Staff (งานที่เป็นสตาฟฟ์)
      ...staffAssignments.map((s) => ({
        id: `staff-${s.userId}-${s.eventId}`,
        eventId: s.event.eventId,
        title: s.event.eventName,
        date: s.event.eventDate,
        venue: s.event.venue,
        imageUrl: s.event.imageUrl,
        role: 'Staff' as const,
      })),
    ];

    res.json(formattedItems);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'ไม่สามารถดึงข้อมูลกิจกรรมของคุณได้' });
  }
});

// API ดึงข้อมูลตั๋วรายใบตามรหัส TicketRef (ใช้ในหน้า Ticket)
app.get('/api/tickets/:ticketRef', requireAuth, async (req: Request, res: Response) => {
  try {
    const ticketRef = req.params.ticketRef as string;

    const booking = await db.query.bookings.findFirst({
      where: eq(bookings.ticketRef, ticketRef.toUpperCase()),
      with: {
        user: {
          columns: {
            firstName: true,
            lastName: true,
            emailAddress: true,
            phoneNumber: true,
          },
        },
        event: true,
        session: true,
      },
    });

    if (!booking) {
      res.status(404).json({ message: 'ไม่พบรหัสตั๋วนี้ในระบบ' });
      return;
    }

    // ดูตั๋วได้เฉพาะเจ้าของตั๋ว ผู้จัดงาน หรือสตาฟของงานนั้น
    if (booking.userId !== req.userId) {
      const role = await isOrganizerOrStaff(req.userId!, booking.eventId);
      if (!role.organizer && !role.staff) {
        res.status(403).json({ message: 'คุณไม่มีสิทธิ์ดูตั๋วใบนี้' });
        return;
      }
    }

    res.json(booking);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการดึงข้อมูลตั๋ว' });
  }
});

// API สำหรับสร้างกิจกรรมใหม่พร้อมรอบเวลา (ใช้ในหน้า CreateEvent)
app.post('/api/events', requireAuth, async (req: Request, res: Response) => {
  const parsed = createEventSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.issues[0].message, errors: parsed.error.flatten().fieldErrors });
    return;
  }

  try {
    const {
      eventName,
      shortDescription,
      description,
      eventDate,
      venue,
      category,
      imageUrl,
      sessions: sessionList,
    } = parsed.data;

    // 1. ผู้จัดงานคือผู้ที่ล็อกอินอยู่
    const currentUserId = req.userId!;

    // 2. คำนวณความจุรวม (maxCapacity) จากทุก Sessions รวมกัน
    const totalCapacity = Array.isArray(sessionList)
      ? sessionList.reduce((sum: number, s: any) => sum + (Number(s.capacity) || 0), 0)
      : 100;

    // 3. บันทึกข้อมูลหลักของงานลงตาราง events
    const [newEvent] = await db.insert(events).values({
      eventName,
      shortDescription: shortDescription || description?.substring(0, 120) || '',
      description,
      eventDate,
      venue,
      category: category || 'Technology',
      imageUrl:
        imageUrl ||
        'https://images.unsplash.com/photo-1511578314322-379afb476865?w=800&q=80',
      userId: currentUserId,
      eventsStatus: 'Upcoming',
      maxCapacity: totalCapacity,
    }).returning();

    // 4. บันทึกรอบเวลาทั้งหมดลงตาราง sessions โดยผูกกับ eventId ที่เพิ่งสร้าง
    if (Array.isArray(sessionList) && sessionList.length > 0) {
      await db.insert(sessions).values(
        sessionList.map((s: any) => ({
          eventId: newEvent.eventId,
          startTime: s.startTime,
          endTime: s.endTime,
          capacity: Number(s.capacity) || 50,
          booked: 0,
        }))
      );
    } else {
      // default
      // กรณีไม่ได้ส่งรอบเวลามา ให้สร้างรอบมาตรฐาน 1 รอบอัตโนมัติ
      await db.insert(sessions).values({
        eventId: newEvent.eventId,
        startTime: '09:00',
        endTime: '12:00',
        capacity: totalCapacity,
        booked: 0,
      });
    }

    res.status(201).json({
      message: 'สร้างกิจกรรมใหม่สำเร็จ!',
      event: newEvent,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการสร้างกิจกรรม' });
  }
});

// API ดึงข้อมูลสถิติและรายชื่อผู้ลงทะเบียนสำหรับผู้จัดงาน (ใช้ในหน้า OrganizerDashboard)
app.get('/api/events/:id/dashboard', requireAuth, async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;

    // 1. ดึงข้อมูลงานและรอบเวลาทั้งหมด
    const event = await db.query.events.findFirst({
      where: eq(events.eventId, id),
      with: {
        sessions: {
          orderBy: [asc(sessions.startTime)],
        },
      },
    });

    if (!event) {
      res.status(404).json({ message: 'ไม่พบข้อมูลกิจกรรมนี้' });
      return;
    }

    // ดูแดชบอร์ด (มีข้อมูลส่วนตัวของผู้ลงทะเบียน) ได้เฉพาะผู้จัดงานเจ้าของงาน
    if (event.userId !== req.userId) {
      res.status(403).json({ message: 'เฉพาะผู้จัดงานเท่านั้นที่ดูแดชบอร์ดได้' });
      return;
    }

    // 2. ดึงรายชื่อการจอง (Bookings) ทั้งหมดของงานนี้ พร้อมข้อมูลผู้จองและรอบเวลา
    const eventBookings = await db.query.bookings.findMany({
      where: eq(bookings.eventId, id),
      with: {
        user: {
          columns: {
            firstName: true,
            lastName: true,
            emailAddress: true,
            phoneNumber: true,
          },
        },
        session: true,
      },
    });

    res.json({
      event,
      bookings: eventBookings,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'ไม่สามารถดึงข้อมูลแดชบอร์ดของกิจกรรมได้' });
  }
});

// API สำหรับแก้ไขข้อมูลกิจกรรม (ใช้เมื่อกดปุ่ม แก้ไขกิจกรรม ในหน้า OrganizerDashboard)
app.put('/api/events/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const {
      eventName,
      eventDate,
      venue,
      category,
      shortDescription,
      description,
      imageUrl,
      eventsStatus,
    } = req.body;

    const [updatedEvent] = await db
      .update(events)
      .set({
        eventName,
        eventDate,
        venue,
        category,
        shortDescription,
        description,
        imageUrl,
        eventsStatus,
        updatedEventDate: new Date(),
      })
      // แก้ได้เฉพาะงานที่ตัวเองเป็นผู้จัด
      .where(and(eq(events.eventId, id), eq(events.userId, req.userId!)))
      .returning();

    if (!updatedEvent) {
      res.status(404).json({ message: 'ไม่พบกิจกรรมที่ต้องการแก้ไข หรือคุณไม่ใช่ผู้จัดงาน' });
      return;
    }

    res.json({
      message: 'อัปเดตข้อมูลกิจกรรมสำเร็จ!',
      event: updatedEvent,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการแก้ไขกิจกรรม' });
  }
});

// API ดึงข้อมูลโปรไฟล์ผู้ใช้ปัจจุบัน (ใช้ในหน้า MyAccount และ Overview)
app.get('/api/profile', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = await db.query.users.findFirst({ where: eq(users.userId, req.userId!) });
    if (!user) {
      res.status(404).json({ message: 'ไม่พบข้อมูลผู้ใช้งาน' });
      return;
    }
    // ห้ามส่ง passwordHash ออกไปให้ client
    const { passwordHash: _omit, ...safeUser } = user;
    // แนบสถานะการถูกระงับสิทธิ์จอง เพื่อให้ frontend แสดงแจ้งเตือนได้
    res.json({ ...safeUser, ...(await getBookingRestriction(user.userId)) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'ไม่สามารถดึงข้อมูลโปรไฟล์ได้' });
  }
});

// API อัปเดตข้อมูลโปรไฟล์ผู้ใช้ (ใช้ในหน้า MyAccount)
app.put('/api/profile', requireAuth, async (req: Request, res: Response) => {
  const parsed = updateProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.issues[0].message, errors: parsed.error.flatten().fieldErrors });
    return;
  }
  const data = parsed.data;

  try {
    const [updatedUser] = await db
      .update(users)
      .set({
        firstName: data.firstName,
        lastName: data.lastName,
        emailAddress: data.emailAddress,
        phoneNumber: data.phoneNumber ?? null,
        nickname: data.nickname,
        birthday: data.birthday || null,
        occupation: data.occupation,
        workplace: data.workplace,
        profileImage: data.profileImage,
        backgroundImage: data.backgroundImage,
        updatedUserDate: new Date(),
      })
      .where(eq(users.userId, req.userId!))
      .returning();

    const { passwordHash: _omit, ...safeUser } = updatedUser;
    res.json({
      message: 'บันทึกข้อมูลส่วนตัวสำเร็จ!',
      user: safeUser,
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      res.status(409).json({ message: 'อีเมลหรือเบอร์โทรศัพท์นี้ถูกใช้งานแล้ว' });
      return;
    }
    console.error(error);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการอัปเดตข้อมูลส่วนตัว' });
  }
});

export default app;