import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { eq, sql, asc, and } from 'drizzle-orm';
import { db } from './db/index.js';
import { users, events, sessions, bookings, checkInLogs, eventStaffs } from './db/schema.js';
import { loginSchema, createEventSchema, updateProfileSchema } from './validators/zodValidators.js';

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
// app.use(express.json());
app.use(express.json({ limit: '10mb' }));

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
app.post('/api/staff/check-in', async (req: Request, res: Response) => {
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

    // กำหนดเวลาที่จะบันทึกลงฐานข้อมูล
    const now = new Date();

    // อัปเดตสถานะตั๋วเป็น CHECKED_IN และดึงค่าที่บันทึกจริงกลับมาจาก DB ด้วย .returning()
    const [updatedBooking] = await db.update(bookings)
      .set({ 
        bookingStatus: 'CHECKED_IN', 
        checkInTime: now,
        updateBookingDate: now
      })
      .where(eq(bookings.bookingId, booking.bookingId))
      .returning();

    // บันทึกประวัติลงตาราง CHECK-IN LOGS
    await db.insert(checkInLogs).values({
      bookingId: booking.bookingId,
      userId: booking.userId,
      ticketRef: booking.ticketRef,
      actionType: 'IN',
      timestamp: now,
    });

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

// API สำหรับกดจองตั๋วเข้าร่วมกิจกรรม (ใช้ในหน้า EventDetails)
app.post('/api/bookings', async (req: Request, res: Response) => {
  try {
    const { eventId, sessionId, healthDeclaration } = req.body;

    // 1. ตรวจสอบรอบเวลาว่ายังมีที่นั่งว่างหรือไม่
    const session = await db.query.sessions.findFirst({
      where: eq(sessions.sessionId, sessionId),
    });

    if (!session) {
      res.status(404).json({ message: 'ไม่พบรอบเวลานี้ในระบบ' });
      return;
    }

    if (session.booked >= session.capacity) {
      res.status(400).json({ message: 'ขออภัย รอบเวลานี้ที่นั่งเต็มแล้ว!' });
      return;
    }

    // 2. ดึง User ที่กำลัง Login
    const defaultUser = await getCurrentUser(req);
    if (!defaultUser) {
      res.status(400).json({ message: 'ไม่พบข้อมูลผู้ใช้งานในระบบ กรุณารัน seed ข้อมูลก่อน' });
      return;
    }
    const currentUserId = (defaultUser as any).userId || (defaultUser as any).id;

    //  2.5 เพิ่มส่วนนี้: เช็คว่า User คนนี้เคยจอง Event นี้ไปแล้วหรือยัง?
    const existingBooking = await db.query.bookings.findFirst({
      where: and(
        // // แบบ 1 คน จองได้แค่ 1 สิทธิ์ต่อ 1 งานเท่านั้น
        // eq(bookings.userId, currentUserId),
        // eq(bookings.eventId, eventId)
        
        // แบบ 1 คน จองได้หลายรอบเวลาในงานเดียวกัน (แต่ห้ามจองรอบเวลาเดิมซ้ำ)
        eq(bookings.userId, currentUserId), 
        eq(bookings.sessionId, sessionId) 
      ),
    });

    if (existingBooking && existingBooking.bookingStatus !== 'CANCELLED') {
      res.status(400).json({ 
        message: `คุณได้จองตั๋วของกิจกรรมนี้ไปแล้ว! (รหัสตั๋วของคุณคือ: ${existingBooking.ticketRef})`,
        ticketRef: existingBooking.ticketRef, 
      });
      return;
    }

    // 3. สุ่มสร้างรหัสตั๋ว 6 หลัก เช่น EVT-A1B2C3
    const randomChars = Math.random().toString(36).substring(2, 8).toUpperCase();
    const newTicketRef = `EVT-${randomChars}`;

    // 4. บันทึกใบจองลงตาราง bookings
    const [newBooking] = await db.insert(bookings).values({
      ticketRef: newTicketRef,
      userId: currentUserId,
      eventId,
      sessionId,
      bookingStatus: 'CONFIRMED',
      healthDeclaration: healthDeclaration || 'ปกติ',
    }).returning();

    // 5. อัปเดตจำนวนคนจอง (booked + 1) ในตาราง sessions
    await db.update(sessions)
      .set({ booked: sql`${sessions.booked} + 1` })
      .where(eq(sessions.sessionId, sessionId));

    res.status(201).json({
      message: 'จองตั๋วสำเร็จ!',
      booking: newBooking,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการจองตั๋ว' });
  }
});

// API ดึงข้อมูลกิจกรรมของฉันครบทุกบทบาท: Attendee, Organizer, Staff (ใช้ในหน้า MyEvents)
app.get('/api/my-bookings', async (req: Request, res: Response) => {
  try {
    const defaultUser = await getCurrentUser(req);
    if (!defaultUser) {
      res.json([]);
      return;
    }
    const currentUserId = (defaultUser as any).userId || (defaultUser as any).id;

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
app.get('/api/tickets/:ticketRef', async (req: Request, res: Response) => {
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

    res.json(booking);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการดึงข้อมูลตั๋ว' });
  }
});

// API สำหรับสร้างกิจกรรมใหม่พร้อมรอบเวลา (ใช้ในหน้า CreateEvent)
app.post('/api/events', async (req: Request, res: Response) => {
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
    } = req.body;

    // 1. ดึง User ที่กำลัง Login (ผู้จัดงาน)
    const defaultUser = await getCurrentUser(req);
    if (!defaultUser) {
      res.status(400).json({ message: 'ไม่พบข้อมูลผู้ใช้งานในระบบ' });
      return;
    }
    const currentUserId = (defaultUser as any).userId || (defaultUser as any).id;

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
app.get('/api/events/:id/dashboard', async (req: Request, res: Response) => {
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
app.put('/api/events/:id', async (req: Request, res: Response) => {
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
      .where(eq(events.eventId, id))
      .returning();

    if (!updatedEvent) {
      res.status(404).json({ message: 'ไม่พบกิจกรรมที่ต้องการแก้ไข' });
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
app.get('/api/profile', async (req: Request, res: Response) => {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      res.status(404).json({ message: 'ไม่พบข้อมูลผู้ใช้งาน' });
      return;
    }
    res.json(user);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'ไม่สามารถดึงข้อมูลโปรไฟล์ได้' });
  }
});

// API อัปเดตข้อมูลโปรไฟล์ผู้ใช้ (ใช้ในหน้า MyAccount)
app.put('/api/profile', async (req: Request, res: Response) => {
  try {
    const {
      firstName,
      lastName,
      nickname,
      emailAddress,
      phoneNumber,
      birthday,
      occupation,
      workplace,
      profileImage,
      backgroundImage,
      // password, // คอมเมนต์เก็บไว้ก่อน
    } = req.body;

    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      res.status(404).json({ message: 'ไม่พบข้อมูลผู้ใช้งาน' });
      return;
    }
    const currentUserId = (currentUser as any).userId || (currentUser as any).id;

    const updatePayload: Record<string, any> = {
      firstName,
      lastName,
      emailAddress,
      phoneNumber,
      nickname,
      birthday: birthday || null,
      occupation,
      workplace,
      profileImage,
      backgroundImage,
    };

    const [updatedUser] = await db
      .update(users)
      .set(updatePayload)
      .where(eq(users.userId, currentUserId))
      .returning();

    res.json({
      message: 'บันทึกข้อมูลส่วนตัวสำเร็จ!',
      user: updatedUser,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการอัปเดตข้อมูลส่วนตัว' });
  }
});

// ฟังก์ชันช่วยดึง User ปัจจุบันจาก Header (x-user-id) ที่แต่ละแท็บส่งมา
async function getCurrentUser(req: Request) {
  const headerUserId = req.headers['x-user-id'] as string | undefined;
  if (headerUserId) {
    const user = await db.query.users.findFirst({
      where: eq(users.userId, headerUserId),
    });
    if (user) return user;
  }
  // Fallback กรณีไม่ได้ส่ง Header มา ให้ดึงคนแรกเหมือนเดิมเพื่อไม่ให้ระบบเก่าพัง
  return await db.query.users.findFirst();
}

// 🔑 API สำหรับเข้าสู่ระบบ (Login) พร้อมตรวจสอบด้วย Zod
app.post('/api/auth/login', async (req: Request, res: Response) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ 
        message: parsed.error.issues[0].message,
        errors: parsed.error.flatten().fieldErrors 
      });
      return;
    }

    const { emailAddress, password } = parsed.data;

    const user = await db.query.users.findFirst({
      where: eq(users.emailAddress, emailAddress),
    });

    // ตรวจสอบรหัสผ่าน (รองรับทั้งรหัสจำลองใน seed และรหัสที่ตั้งไว้)
    if (!user || (user.passwordHash !== password && password !== '123456')) {
      res.status(401).json({ message: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
      return;
    }

    const { passwordHash, ...safeUser } = user;
    res.json({
      message: 'เข้าสู่ระบบสำเร็จ!',
      user: safeUser,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ' });
  }
});

// 📋 API ดึงรายชื่อ User ทั้งหมดสำหรับปุ่มสลับบัญชีด่วน (Demo Switcher ตอนสอบ)
app.get('/api/auth/demo-users', async (req: Request, res: Response) => {
  const allUsers = await db.query.users.findMany({
    columns: {
      userId: true,
      firstName: true,
      lastName: true,
      emailAddress: true,
      occupation: true,
      profileImage: true,
    },
  });
  res.json(allUsers);
});

export default app;