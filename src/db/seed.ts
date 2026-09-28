import { db } from './index.js';
import {
  users,
  events,
  sessions,
  bookings,
  eventStaffs,
  checkInLogs,
} from './schema.js';

async function seed() {
  console.log('🌱 กำลังเริ่มต้นล้างข้อมูลเก่าและสร้างข้อมูลจำลองชุดใหญ่ (Seeding)...');

  try {
    // 1. ล้างข้อมูลเก่าตามลำดับ Foreign Key เพื่อไม่ให้ติด Constraint Error
    await db.delete(checkInLogs);
    await db.delete(eventStaffs);
    await db.delete(bookings);
    await db.delete(sessions);
    await db.delete(events);
    await db.delete(users);

    // ============================================================================
    // 2. สร้างข้อมูลผู้ใช้งาน (Users) จำนวน 8 คน
    // * หมายเหตุ: คนแรกสุดคือ User หลักที่ระบบดึงไปแสดงผลเป็นผู้ใช้ปัจจุบัน *
    // ============================================================================
    const insertedUsers = await db
      .insert(users)
      .values([
        {
          firstName: 'กรณ์ภพ',
          lastName: 'ดวงศ์',
          nickname: 'ฟิวส์',
          emailAddress: 'worapop.k@cmu.ac.th',
          phoneNumber: '0812345678', // ปรับเบอร์โทรให้มีความยาวไม่เกิน 10 หลักตาม schema.ts
          passwordHash: 'hashed_password_123',
          birthday: new Date('2005-10-24'), // 👈 แปลงเป็น Date object
          occupation: 'นักศึกษาวิศวกรรมคอมพิวเตอร์',
          workplace: 'มหาวิทยาลัยเชียงใหม่',
          profileImage:
            'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&q=80',
          backgroundImage:
            'https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=1200&q=80',
        },
        {
          firstName: 'กิตติพงศ์',
          lastName: 'เจริญรัตน์',
          nickname: 'กิต',
          emailAddress: 'kittipong.j@example.com',
          phoneNumber: '0891112233',
          passwordHash: 'hashed_password_123',
          birthday: new Date('2003-05-14'), // 👈 แปลงเป็น Date object
          occupation: 'Frontend Developer',
          workplace: 'Chiang Mai Digital Lab',
        },
        {
          firstName: 'พิมพ์ชนก',
          lastName: 'สุวรรณศรี',
          nickname: 'พิม',
          emailAddress: 'pimchanok.s@example.com',
          phoneNumber: '0864456677',
          passwordHash: 'hashed_password_123',
          birthday: new Date('2004-08-21'), // 👈 แปลงเป็น Date object
          occupation: 'UX/UI Designer',
          workplace: 'Creative Studio CNX',
        },
        {
          firstName: 'ธนภัทร',
          lastName: 'วงศ์สวัสดิ์',
          nickname: 'ภัทร',
          emailAddress: 'thanapat.w@example.com',
          phoneNumber: '0829988877',
          passwordHash: 'hashed_password_123',
          birthday: new Date('2002-11-03'), // 👈 แปลงเป็น Date object
          occupation: 'System Engineer',
          workplace: 'Tech Sphere Thailand',
        },
        {
          firstName: 'ณัฐณิชา',
          lastName: 'อัครเดช',
          nickname: 'ณิชา',
          emailAddress: 'nattanicha.a@example.com',
          phoneNumber: '0912233344',
          passwordHash: 'hashed_password_123',
          birthday: new Date('2005-02-19'), // 👈 แปลงเป็น Date object
          occupation: 'นักศึกษา',
          workplace: 'มหาวิทยาลัยเชียงใหม่',
        },
        {
          firstName: 'ศุภกร',
          lastName: 'ตั้งเจริญ',
          nickname: 'เอิร์ธ',
          emailAddress: 'supakorn.t@example.com',
          phoneNumber: '0956677788',
          passwordHash: 'hashed_password_123',
          birthday: new Date('2001-07-30'), // 👈 แปลงเป็น Date object
          occupation: 'Data Analyst',
          workplace: 'Northern Data Co., Ltd.',
        },
        {
          firstName: 'ชลธิชา',
          lastName: 'เลิศปัญญา',
          nickname: 'มิ้นท์',
          emailAddress: 'chonticha.l@example.com',
          phoneNumber: '0845567890',
          passwordHash: 'hashed_password_123',
          birthday: new Date('2004-12-10'), // 👈 แปลงเป็น Date object
          occupation: 'Digital Artist & Illustrator',
          workplace: 'Freelance',
        },
        {
          firstName: 'ปวริศ',
          lastName: 'เกียรติไพบูลย์',
          nickname: 'ปอนด์',
          emailAddress: 'pawaris.k@example.com',
          phoneNumber: '0998876543',
          passwordHash: 'hashed_password_123',
          birthday: new Date('1999-04-05'), // 👈 แปลงเป็น Date object
          occupation: 'Project Manager',
          workplace: 'Lanna Innovation Hub',
        },
      ])
      .returning();

    const [mainUser, user2, user3, user4, user5, user6, user7, user8] = insertedUsers;

    // ============================================================================
    // 3. สร้างข้อมูลกิจกรรม (Events) จำนวน 6 งาน (ครอบคลุมทุกหมวดหมู่)
    // ============================================================================
    const insertedEvents = await db
      .insert(events)
      .values([
        // งานที่ 1: กรณ์ภพ เป็น Attendee (มีรอบเต็ม 200/200 และรอบว่าง)
        {
          userId: user8.userId,
          eventName: 'สัมมนา Full Stack Developer 2026',
          shortDescription:
            'เจาะลึกสถาปัตยกรรมเว็บยุคใหม่ด้วย React, Node.js, TypeScript และ PostgreSQL',
          description:
            'งานสัมมนาใหญ่ประจำปีสำหรับนักพัฒนาซอฟต์แวร์และนักศึกษาสายเทคโนโลยี พบกับหัวข้อการออกแบบ RESTful API, การใช้งาน Drizzle ORM ร่วมกับฐานข้อมูล PostgreSQL และการปรับแต่งประสิทธิภาพระบบให้รองรับผู้ใช้งานจริง',
          eventDate: '2026-10-15',
          venue: 'หอประชุมมหาวิทยาลัยเชียงใหม่ (CMU Auditorium)',
          category: 'Technology',
          imageUrl:
            'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=1000&q=80',
          eventsStatus: 'Upcoming',
          maxCapacity: 500,
        },
        
        {
          userId: mainUser.userId,
          eventName: 'เวิร์กชอป React & TypeScript เชิงลึก',
          shortDescription:
            'ลงมือเขียนเว็บแอปพลิเคชันแบบ Full Stack ตั้งแต่ศูนย์จนเชื่อมต่อฐานข้อมูลจริง',
          description:
            'เวิร์กชอปภาคปฏิบัติที่ผู้เข้าร่วมจะได้ลงมือสร้างระบบจัดการอีเวนต์และสแกน QR Code ด้วยตัวเอง เรียนรู้การจัดการ State, React Router, Tailwind CSS และการเชื่อมโยงข้อมูลกับ Backend อย่างเป็นระบบ',
          eventDate: '2026-11-20',
          venue: 'อาคารนวัตกรรมดิจิทัล คณะวิศวกรรมศาสตร์ มช.',
          category: 'Workshop',
          imageUrl:
            'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=1000&q=80',
          eventsStatus: 'Upcoming',
          maxCapacity: 150,
        },
        
        {
          userId: user8.userId,
          eventName: 'คอนเสิร์ตส่งท้ายปี Lanna Music Fest 2026',
          shortDescription:
            'เทศกาลดนตรีกลางแจ้งรับลมหนาวเชียงใหม่ รวมศิลปินอินดี้และป๊อปชั้นนำ',
          description:
            'ร่วมส่งท้ายปีเก่าต้อนรับปีใหม่ไปกับเทศกาลดนตรีท่ามกลางบรรยากาศลมหนาวเมืองเชียงใหม่ เพลิดเพลินกับเวทีการแสดงสด โซนอาหารท้องถิ่น และกิจกรรมพิเศษตลอดทั้งคืน',
          eventDate: '2026-12-31',
          venue: 'ลานประเสริฐแลนด์ (กาดเชิงดอย) เชียงใหม่',
          category: 'Music & Concert',
          imageUrl:
            'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=1000&q=80',
          eventsStatus: 'Upcoming',
          maxCapacity: 600,
        },
        
        {
          userId: mainUser.userId,
          eventName: 'Digital Illustration & Character Design Expo 2026',
          shortDescription:
            'นิทรรศการและเวิร์กชอปออกแบบตัวละครอนิเมะและเทคนิคการลงสีดิจิทัล',
          description:
            'งานรวมพลคนรักการวาดภาพดิจิทัล มังงะ และไลท์โนเวล พบกับโซนทดลองเมาส์ปากกาหน้าจอ ทอล์กโชว์จากนักวาดภาพประกอบมืออาชีพ และเวิร์กชอปเทคนิคการใช้โปรแกรม Clip Studio Paint',
          eventDate: '2026-11-08',
          venue: 'ศูนย์ประชุมและแสดงสินค้านานาชาติ เชียงใหม่',
          category: 'Art & Culture',
          imageUrl:
            'https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=1000&q=80',
          eventsStatus: 'Upcoming',
          maxCapacity: 200,
        },
        
        {
          userId: user8.userId,
          eventName: 'Chiang Mai Startup & AI Pitching Day 2026',
          shortDescription:
            'เวทีนำเสนอไอเดียธุรกิจสตาร์ทอัพด้าน AI และนวัตกรรมดิจิทัลระดับภาคเหนือ',
          description:
            'เปิดโอกาสให้นักศึกษาและผู้ประกอบการรุ่นใหม่นำเสนอผลงานนวัตกรรมต่อหน้านักลงทุน พร้อมรับฟังวิสัยทัศน์ด้านการประยุกต์ใช้ AI ในภาคธุรกิจจริง',
          eventDate: '2026-10-28',
          venue: 'อุทยานวิทยาศาสตร์และเทคโนโลยี มหาวิทยาลัยเชียงใหม่ (STeP)',
          category: 'Business',
          imageUrl:
            'https://images.unsplash.com/photo-1559136555-9303baea8ebd?w=1000&q=80',
          eventsStatus: 'Ongoing',
          maxCapacity: 250,
        },
        // งานที่ 6: กิจกรรมว่างสำหรับให้กดทดลองจองใหม่ในหน้า ExploreEvents
        {
          userId: user8.userId,
          eventName: 'Cybersecurity & Cloud Architecture Bootcamp',
          shortDescription:
            'เจาะลึกการวางระบบคลาวด์และการป้องกันภัยคุกคามทางไซเบอร์สำหรับองค์กร',
          description:
            'เรียนรู้การตั้งค่าความปลอดภัยบนระบบ Cloud, การทำ Penetration Testing เบื้องต้น และการป้องกันช่องโหว่ OWASP Top 10 สำหรับเว็บแอปพลิเคชัน',
          eventDate: '2026-12-12',
          venue: 'โรงแรมโนโวเทล เชียงใหม่ นิมมาน เจอร์นีย์ฮับ',
          category: 'Technology',
          imageUrl:
            'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=1000&q=80',
          eventsStatus: 'Upcoming',
          maxCapacity: 180,
        },
      ])
      .returning();

    const [evFullStack, evReactWorkshop, evConcert, evArtExpo, evStartup, evCyber] =
      insertedEvents;

    // ============================================================================
    // 4. สร้างรอบเวลา (Sessions) ให้ครบทุกกิจกรรม
    // ============================================================================
    const insertedSessions = await db
      .insert(sessions)
      .values([
        // รอบของงานที่ 1: สัมมนา Full Stack Developer 2026
        {
          eventId: evFullStack.eventId,
          startTime: '09:00',
          endTime: '12:00',
          capacity: 200,
          booked: 200, // เต็มแล้ว (ไว้ทดสอบปุ่มสีเทา "เต็มแล้ว")
        },
        {
          eventId: evFullStack.eventId,
          startTime: '13:00',
          endTime: '16:00',
          capacity: 200,
          booked: 145,
        },
        {
          eventId: evFullStack.eventId,
          startTime: '16:30',
          endTime: '19:30',
          capacity: 100,
          booked: 33,
        },

        
        {
          eventId: evReactWorkshop.eventId,
          startTime: '09:00',
          endTime: '12:00',
          capacity: 50,
          booked: 4,
        },
        {
          eventId: evReactWorkshop.eventId,
          startTime: '13:00',
          endTime: '16:00',
          capacity: 50,
          booked: 3,
        },
        {
          eventId: evReactWorkshop.eventId,
          startTime: '16:30',
          endTime: '19:00',
          capacity: 50,
          booked: 1,
        },

        // รอบของงานที่ 3: คอนเสิร์ตส่งท้ายปี Lanna Music Fest
        {
          eventId: evConcert.eventId,
          startTime: '17:00',
          endTime: '20:00',
          capacity: 300,
          booked: 180,
        },
        {
          eventId: evConcert.eventId,
          startTime: '20:30',
          endTime: '23:59',
          capacity: 300,
          booked: 245,
        },

        // รอบของงานที่ 4: Digital Illustration & Character Design Expo
        {
          eventId: evArtExpo.eventId,
          startTime: '10:00',
          endTime: '13:00',
          capacity: 100,
          booked: 64,
        },
        {
          eventId: evArtExpo.eventId,
          startTime: '14:00',
          endTime: '17:00',
          capacity: 100,
          booked: 52,
        },

        // รอบของงานที่ 5: Chiang Mai Startup & AI Pitching Day
        {
          eventId: evStartup.eventId,
          startTime: '09:30',
          endTime: '12:30',
          capacity: 125,
          booked: 98,
        },
        {
          eventId: evStartup.eventId,
          startTime: '13:30',
          endTime: '16:30',
          capacity: 125,
          booked: 85,
        },

        // รอบของงานที่ 6: Cybersecurity Bootcamp
        {
          eventId: evCyber.eventId,
          startTime: '09:00',
          endTime: '12:00',
          capacity: 90,
          booked: 25,
        },
        {
          eventId: evCyber.eventId,
          startTime: '13:00',
          endTime: '16:00',
          capacity: 90,
          booked: 18,
        },
      ])
      .returning();

    const [
      sFull1,
      sFull2,
      sFull3,
      sReact1,
      sReact2,
      sReact3,
      sConcert1,
      sConcert2,
      sArt1,
      sArt2,
      sStartup1,
    ] = insertedSessions;

    // ============================================================================
    // 5. กำหนดสิทธิ์ Staff 
    // ============================================================================
    await db.insert(eventStaffs).values([
      {
        eventId: evConcert.eventId,
        userId: mainUser.userId,
        assignedBy: user8.userId, // <-- เพิ่มผู้มอบหมายงาน (Organizer ของงานคอนเสิร์ต)
        zone: 'Main Gate A',
      },
      {
        eventId: evReactWorkshop.eventId,
        userId: user4.userId,
        assignedBy: mainUser.userId, 
        zone: 'Registration Desk',
      },
    ]);

    // ============================================================================
    // 6. สร้างรายการจองตั๋ว (Bookings)
    // ============================================================================
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const thirtyMinsAgo = new Date(now.getTime() - 30 * 60 * 1000);

    const insertedBookings = await db
      .insert(bookings)
      .values([
       
        {
          userId: mainUser.userId,
          eventId: evFullStack.eventId,
          sessionId: sFull2.sessionId,
          ticketRef: 'EVT-8A2B9C', // พร้อมนำไปสแกนที่หน้า StaffScanner!
          bookingStatus: 'CONFIRMED',
          healthDeclaration: 'ปกติ ไม่แพ้อาหาร',
        },
        {
          userId: mainUser.userId,
          eventId: evStartup.eventId,
          sessionId: sStartup1.sessionId,
          ticketRef: 'EVT-CMU999', // สแกนเช็คอินไปแล้ว (ไว้ดูสถานะสีเขียว)
          bookingStatus: 'CHECKED_IN',
          healthDeclaration: 'ปกติ',
          checkInTime: oneHourAgo,
        },

       
        {
          userId: user2.userId,
          eventId: evReactWorkshop.eventId,
          sessionId: sReact1.sessionId,
          ticketRef: 'EVT-RCT101',
          bookingStatus: 'CHECKED_IN',
          healthDeclaration: 'แพ้อาหารทะเล (กุ้ง, ปู)',
          checkInTime: oneHourAgo,
        },
        {
          userId: user3.userId,
          eventId: evReactWorkshop.eventId,
          sessionId: sReact1.sessionId,
          ticketRef: 'EVT-RCT102',
          bookingStatus: 'CHECKED_IN',
          healthDeclaration: 'ปกติ',
          checkInTime: thirtyMinsAgo,
        },
        {
          userId: user4.userId,
          eventId: evReactWorkshop.eventId,
          sessionId: sReact1.sessionId,
          ticketRef: 'EVT-RCT103',
          bookingStatus: 'CONFIRMED',
          healthDeclaration: 'มังสวิรัติ (ไม่ทานเนื้อสัตว์)',
        },
        {
          userId: user5.userId,
          eventId: evReactWorkshop.eventId,
          sessionId: sReact1.sessionId,
          ticketRef: 'EVT-RCT104',
          bookingStatus: 'CONFIRMED',
          healthDeclaration: 'แพ้ถั่วลิสง',
        },
        {
          userId: user6.userId,
          eventId: evReactWorkshop.eventId,
          sessionId: sReact2.sessionId,
          ticketRef: 'EVT-RCT201',
          bookingStatus: 'CHECKED_IN',
          healthDeclaration: 'ปกติ',
          checkInTime: thirtyMinsAgo,
        },
        {
          userId: user7.userId,
          eventId: evReactWorkshop.eventId,
          sessionId: sReact2.sessionId,
          ticketRef: 'EVT-RCT202',
          bookingStatus: 'CONFIRMED',
          healthDeclaration: 'แพ้นมวัว',
        },
        {
          userId: user8.userId,
          eventId: evReactWorkshop.eventId,
          sessionId: sReact2.sessionId,
          ticketRef: 'EVT-RCT203',
          bookingStatus: 'CONFIRMED',
          healthDeclaration: 'ปกติ',
        },
        {
          userId: mainUser.userId,
          eventId: evReactWorkshop.eventId,
          sessionId: sReact3.sessionId,
          ticketRef: 'EVT-RCT301',
          bookingStatus: 'CONFIRMED',
          healthDeclaration: 'ผู้จัดงานเข้าร่วมสังเกตการณ์',
        },

        // --- รายชื่อผู้เข้าร่วมในงาน "Digital Illustration Expo" ---
        {
          userId: user7.userId,
          eventId: evArtExpo.eventId,
          sessionId: sArt1.sessionId,
          ticketRef: 'EVT-ART501',
          bookingStatus: 'CHECKED_IN',
          healthDeclaration: 'ปกติ',
          checkInTime: oneHourAgo,
        },
        {
          userId: user3.userId,
          eventId: evArtExpo.eventId,
          sessionId: sArt2.sessionId,
          ticketRef: 'EVT-ART502',
          bookingStatus: 'CONFIRMED',
          healthDeclaration: 'ปกติ',
        },
      ])
      .returning();

    // ============================================================================
    // 7. บันทึกประวัติการสแกนตั๋ว (CheckInLogs) สำหรับใบที่เช็คอินแล้ว
    // ============================================================================
    const checkedInBookings = insertedBookings.filter(
      (b) => b.bookingStatus === 'CHECKED_IN'
    );

    if (checkedInBookings.length > 0) {
      await db.insert(checkInLogs).values(
        checkedInBookings.map((b) => ({
          bookingId: b.bookingId,
          ticketRef: b.ticketRef, // <-- เพิ่มรหัสตั๋วตามที่ schema กำหนด
          userId: user4.userId,   // <-- ใช้ userId แทน scannedBy
          actionType: 'IN' as const,
        }))
      );
    }

    console.log('✅ สร้างข้อมูลจำลอง (Seed) สำเร็จครบทุกตาราง!');
    console.log('------------------------------------------------------------');
    console.log('🎟️ รหัสตั๋วสำหรับนำไปทดสอบสแกนในหน้า Staff Scanner (สถานะ CONFIRMED):');
    console.log('   - EVT-8A2B9C (คุณกรณ์ภพ - งานสัมมนา Full Stack)');
    console.log('   - EVT-RCT103 (คุณธนภัทร - งานเวิร์กชอป React)');
    console.log('   - EVT-RCT104 (คุณณัฐณิชา - งานเวิร์กชอป React)');
    console.log('   - EVT-RCT202 (คุณชลธิชา - งานเวิร์กชอป React)');
    console.log('------------------------------------------------------------');
    process.exit(0);
  } catch (error) {
    console.error('❌ เกิดข้อผิดพลาดในการทำ Seed:', error);
    process.exit(1);
  }
}

seed();