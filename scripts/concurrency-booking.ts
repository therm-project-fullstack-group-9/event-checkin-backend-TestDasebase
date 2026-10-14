// รัน: pnpm tsx scripts/concurrency-booking.ts  (ต้องมี DB ที่ push schema แล้ว) — จำลองคน 30 คนจองรอบที่เหลือ 3 ที่นั่งพร้อมกัน ต้องสำเร็จ 3
import request from 'supertest';
import { db } from '../src/db/index.js';
import { users, events, sessions, bookings } from '../src/db/schema.js';
import { signAccessToken } from '../src/auth/jwt.js';
import app from '../src/app.js';
import { eq } from 'drizzle-orm';
(async()=>{
const N=30;
const us = await db.insert(users).values(Array.from({length:N+1},(_,i)=>({firstName:'u'+i,lastName:'x',emailAddress:`u${i}-${Date.now()}@x.com`,phoneNumber:String(Math.floor(1e9+Math.random()*8e9)+i).slice(0,10),passwordHash:'x'}))).returning();
const [ev] = await db.insert(events).values({eventName:'e',shortDescription:'s',description:'d',eventDate:'2026-12-01',venue:'v',category:'c',imageUrl:'u',userId:us[0].userId,maxCapacity:3}).returning();
const [s] = await db.insert(sessions).values({eventId:ev.eventId,startTime:'09:00',endTime:'10:00',capacity:3}).returning();
const rs = await Promise.all(us.slice(1).map(u=>request(app).post('/api/bookings').set('Authorization','Bearer '+signAccessToken(u.userId)).send({sessionId:s.sessionId})));
const codes:Record<number,number>={}; rs.forEach(r=>codes[r.status]=(codes[r.status]||0)+1);
// same user double booking concurrently
const dup = await Promise.all([1,2,3,4,5].map(()=>request(app).post('/api/bookings').set('Authorization','Bearer '+signAccessToken(us[0].userId)).send({sessionId:s.sessionId})));
const [fin]=await db.select().from(sessions).where(eq(sessions.sessionId,s.sessionId));
const cnt=(await db.select().from(bookings).where(eq(bookings.sessionId,s.sessionId))).length;
console.log('codes',codes,'dup',dup.map(r=>r.status),'booked',fin.booked,'rows',cnt);
process.exit(0);

})();