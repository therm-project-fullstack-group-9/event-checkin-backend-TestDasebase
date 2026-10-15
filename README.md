# Term Project - BACKEND AND Database (DEV MODE)

## Setup
  ### 1. Clone Repository
  - git clone <URL's Repository>
  - cd TP-BACKEND
  ### 2. Install Dependencies
  - pnpm install
  ### 3. Setting Environment Variables
  - คัดลอก `.env.example` เป็น `.env` แล้วแก้ค่า (ต้องตั้ง `JWT_SECRET`, และ `OAUTH_*` ถ้าจะใช้ล็อกอินด้วย CMU OAuth)
  ### 4. Start the database
  - docker compose up -d

  ### 5. Push Database Schema & Seed Data
  - pnpm drizzle-kit push
  - pnpm tsx src/db/seed.ts
  ### 6. Start the backend
  - pnpm run dev

## Usage
  - pnpm drizzle-kit push หรือ pnpm run db:push
  - pnpm tsx src/db/seed.ts
  - pnpm drizzle-kit generate
  - pnpm drizzle-kit migrate

  
   

## Authentication
  - `POST /api/auth/register` สมัครสมาชิก (รหัสผ่าน >= 8 ตัว เก็บเป็น bcrypt hash)
  - `POST /api/auth/login` คืน `{ token, user }`
  - `GET  /api/auth/me` ผู้ใช้ปัจจุบัน
  - `GET  /api/auth/cmu` เริ่มล็อกอินด้วย CMU Mock OAuth -> redirect กลับ `FRONTEND_URL/auth/callback#token=<JWT>`
  - ทุก endpoint ที่เหลือ (ยกเว้น `/api/health`, `GET /api/events`, `GET /api/events/:id`) ต้องแนบ `Authorization: Bearer <token>`
  - ทดสอบ: `pnpm tsx scripts/auth-smoke.ts` และ `pnpm tsx scripts/concurrency-booking.ts` (ต้อง `db:push` ก่อน)

## กฎโควตาอัตโนมัติ (ไม่มาตามรอบ)
  - ตั๋วที่ยัง `CONFIRMED` แต่เลยเวลาสิ้นสุดของรอบ (เวลาไทย) จะถูกเปลี่ยนเป็น `NO_SHOW` อัตโนมัติ (ตรวจตอนจอง/สแกน และกวาดทุก 5 นาทีใน `src/index.ts`)
  - ตั๋ว `NO_SHOW` สแกนเข้างานไม่ได้ (`403`, `code: SESSION_ENDED | NO_SHOW`)
  - ผู้ใช้ที่มี `NO_SHOW` ครบ `NO_SHOW_LIMIT` (ค่าเริ่มต้น 1) จองตั๋วใหม่ไม่ได้ (`403`, `code: BOOKING_BLOCKED`) และ `GET /api/profile` คืน `noShowCount`, `bookingBlocked`
  - จองรอบที่สิ้นสุดไปแล้วไม่ได้ (`400`)
  - สตาฟ: `GET|POST /api/events/:id/staff`, `DELETE /api/events/:id/staff/:userId` (เฉพาะผู้จัดงาน)
  - ลบกิจกรรม: `DELETE /api/events/:id` (เฉพาะผู้จัดงาน; รอบเวลา ใบจอง สตาฟ และประวัติเช็กอินถูกลบตามด้วย `ON DELETE CASCADE`)
  - กิจกรรมสถานะ `Cancelled` ไม่แสดงใน `GET /api/events` และจองไม่ได้ (`409`, `code: EVENT_CANCELLED`) แต่ `GET /api/events/:id` ยังเปิดดูได้
  - ทดสอบ: `pnpm tsx scripts/quota-test.ts`, `pnpm tsx scripts/event-lifecycle-test.ts`, `pnpm test`

## Docker
  - `docker build -t event-checkin-backend .` (image มี drizzle-kit/tsx ด้วย รัน `pnpm db:push` ใน container ได้)
  - ตั้ง `POSTGRES_HOST=<ชื่อ service ของ DB>` หรือใช้ `DATABASE_URL`
