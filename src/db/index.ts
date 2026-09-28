// เปิดการเชื่อมต่อกับ PostgreSQL
import 'dotenv/config';
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "process";
import * as schema from './schema.js';

const dbUser = process.env.POSTGRES_APP_USER;
const dbPassword = process.env.POSTGRES_APP_PASSWORD;
const dbPort = process.env.POSTGRES_PORT;
const dbName = process.env.POSTGRES_DB;

const pool = new Pool({
  // connectionString: env.DATABASE_URL
  // # DATABASE_URL="postgres://postgres:postgres@localhost:5432/event_checkin"
  connectionString: `postgres://${dbUser}:${dbPassword}@localhost:${dbPort}/${dbName}`,
});

export const db = drizzle(pool, { schema });