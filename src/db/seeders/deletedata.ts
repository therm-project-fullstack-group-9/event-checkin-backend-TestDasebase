import { db } from '../index.js';
import {
  users,
  events,
  sessions,
  bookings,
  eventStaffs,
  checkInLogs,
} from '../schema.js';

async function deletedata() {
  console.log('กำลังเริ่มต้นล้างข้อมูลเก่า...');

  try {
    // 1. ล้างข้อมูลเก่าตามลำดับ Foreign Key เพื่อไม่ให้ติด Constraint Error
    await db.delete(checkInLogs);
    await db.delete(eventStaffs);
    await db.delete(bookings);
    await db.delete(sessions);
    await db.delete(events);
    await db.delete(users);

    }catch (error) {
        console.error('❌ เกิดข้อผิดพลาดในการทำ deletedata:', error);
        process.exit(1);
    }
}

deletedata();