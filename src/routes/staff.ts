import { Router, type Request, type Response } from 'express';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.js';
import { events, eventStaffs, users } from '../db/schema.js';
import { requireAuth } from '../auth/middleware.js';

// จัดการสตาฟของกิจกรรม — ทำได้เฉพาะผู้จัดงานเจ้าของกิจกรรม
const router = Router();
router.use(requireAuth);

const addStaffSchema = z.object({
  emailAddress: z.string().trim().toLowerCase().email('รูปแบบอีเมลไม่ถูกต้อง'),
  zone: z.string().trim().min(1).max(50).optional(),
});

async function loadOwnedEvent(req: Request, res: Response) {
  const event = await db.query.events.findFirst({ where: eq(events.eventId, String(req.params.id)) });
  if (!event) {
    res.status(404).json({ message: 'ไม่พบกิจกรรมนี้' });
    return null;
  }
  if (event.userId !== req.userId) {
    res.status(403).json({ message: 'เฉพาะผู้จัดงานเท่านั้นที่จัดการสตาฟได้' });
    return null;
  }
  return event;
}

router.get('/:id/staff', async (req: Request, res: Response) => {
  const event = await loadOwnedEvent(req, res);
  if (!event) return;
  const staffs = await db.query.eventStaffs.findMany({
    where: eq(eventStaffs.eventId, event.eventId),
    with: { user: { columns: { userId: true, firstName: true, lastName: true, emailAddress: true } } },
  });
  res.json(staffs);
});

router.post('/:id/staff', async (req: Request, res: Response) => {
  const event = await loadOwnedEvent(req, res);
  if (!event) return;

  const parsed = addStaffSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.issues[0].message });
    return;
  }
  const user = await db.query.users.findFirst({ where: eq(users.emailAddress, parsed.data.emailAddress) });
  if (!user) {
    res.status(404).json({ message: 'ไม่พบผู้ใช้อีเมลนี้ในระบบ (ต้องสมัครสมาชิกก่อน)' });
    return;
  }
  try {
    const [row] = await db
      .insert(eventStaffs)
      .values({
        userId: user.userId,
        eventId: event.eventId,
        assignedBy: req.userId!,
        ...(parsed.data.zone ? { zone: parsed.data.zone } : {}),
      })
      .returning();
    res.status(201).json({ message: 'เพิ่มสตาฟสำเร็จ', staff: row });
  } catch (error) {
    if ((error as { code?: string })?.code === '23505' || (error as { cause?: { code?: string } })?.cause?.code === '23505') {
      res.status(409).json({ message: 'ผู้ใช้นี้เป็นสตาฟของกิจกรรมนี้อยู่แล้ว' });
      return;
    }
    console.error(error);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการเพิ่มสตาฟ' });
  }
});

router.delete('/:id/staff/:userId', async (req: Request, res: Response) => {
  const event = await loadOwnedEvent(req, res);
  if (!event) return;
  const removed = await db
    .delete(eventStaffs)
    .where(and(eq(eventStaffs.eventId, event.eventId), eq(eventStaffs.userId, String(req.params.userId))))
    .returning();
  if (removed.length === 0) {
    res.status(404).json({ message: 'ไม่พบสตาฟคนนี้ในกิจกรรม' });
    return;
  }
  res.json({ message: 'ลบสตาฟสำเร็จ' });
});

export default router;
