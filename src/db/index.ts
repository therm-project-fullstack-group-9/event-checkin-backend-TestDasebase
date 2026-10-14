// เปิดการเชื่อมต่อกับ PostgreSQL
import 'dotenv/config';
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from './schema.js';

const dbUser = process.env.POSTGRES_APP_USER;
const dbPassword = process.env.POSTGRES_APP_PASSWORD;
const dbPort = process.env.POSTGRES_PORT;
const dbName = process.env.POSTGRES_DB;

// ใช้ DATABASE_URL เป็นหลัก (ตัวเดียวกับที่ drizzle-kit ใช้) ถ้าไม่มีค่อยประกอบจาก POSTGRES_*
// POSTGRES_HOST ตั้งเป็นชื่อ service (เช่น postgres) เมื่อรันใน Docker
const dbHost = process.env.POSTGRES_HOST ?? 'localhost';

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ??
    `postgres://${dbUser}:${dbPassword}@${dbHost}:${dbPort ?? 5432}/${dbName}`,
});

export const db = drizzle(pool, { schema });