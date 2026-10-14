import { z } from 'zod';

// 1. กฎตรวจสอบการเข้าสู่ระบบ
export const loginSchema = z.object({
  emailAddress: z.string().trim().toLowerCase().email('รูปแบบอีเมลไม่ถูกต้อง'),
  password: z.string().min(1, 'กรุณากรอกรหัสผ่าน'),
});

// กฎตรวจสอบการสมัครสมาชิก
export const registerSchema = z.object({
  firstName: z.string().trim().min(1, 'กรุณากรอกชื่อจริง'),
  lastName: z.string().trim().min(1, 'กรุณากรอกนามสกุล'),
  emailAddress: z.string().trim().toLowerCase().email('รูปแบบอีเมลไม่ถูกต้อง'),
  phoneNumber: z.string().regex(/^[0-9]{10}$/, 'เบอร์โทรศัพท์ต้องเป็นตัวเลข 10 หลัก').optional(),
  password: z.string().min(8, 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร').max(72, 'รหัสผ่านยาวเกินไป'),
});

// 2. กฎตรวจสอบการสร้างกิจกรรมใหม่
export const createEventSchema = z.object({
  eventName: z.string().min(3, 'ชื่อกิจกรรมต้องมีอย่างน้อย 3 ตัวอักษร'),
  shortDescription: z.string().optional(),
  description: z.string().min(10, 'รายละเอียดต้องมีอย่างน้อย 10 ตัวอักษร'),
  eventDate: z.string().min(1, 'กรุณาระบุวันที่จัดงาน'),
  venue: z.string().min(2, 'กรุณาระบุสถานที่จัดงาน'),
  category: z.string().default('Technology'),
  imageUrl: z.string().url('ลิงก์รูปภาพไม่ถูกต้อง').optional().or(z.literal('')),
  sessions: z.array(
    z.object({
      startTime: z.string().min(1, 'กรุณาระบุเวลาเริ่ม'),
      endTime: z.string().min(1, 'กรุณาระบุเวลาสิ้นสุด'),
      capacity: z.coerce.number().min(1, 'จำนวนที่นั่งต้องมากกว่า 0'),
    })
  ).min(1, 'ต้องมีอย่างน้อย 1 รอบเวลา'),
});

// 3. กฎตรวจสอบการแก้ไขโปรไฟล์
export const updateProfileSchema = z.object({
  firstName: z.string().min(1, 'กรุณากรอกชื่อจริง'),
  lastName: z.string().min(1, 'กรุณากรอกนามสกุล'),
  nickname: z.string().optional().nullable(),
  emailAddress: z.string().email('รูปแบบอีเมลไม่ถูกต้อง'),
  phoneNumber: z.string().regex(/^[0-9]{10}$/, 'เบอร์โทรศัพท์ต้องเป็นตัวเลข 10 หลัก').optional().nullable(),
  birthday: z.string().optional().nullable(),
  occupation: z.string().optional().nullable(),
  workplace: z.string().optional().nullable(),
  profileImage: z.string().optional().nullable(),
  backgroundImage: z.string().optional().nullable(),
});