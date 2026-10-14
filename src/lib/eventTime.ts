// เวลาของรอบกิจกรรมเก็บเป็นข้อความ "HH:MM" แยกจากวันที่ จึงต้องประกอบเป็นเวลาจริงก่อนเปรียบเทียบ
// ทุกอย่างตีความเป็นเวลาประเทศไทย (UTC+7) ไม่ว่า server จะตั้ง timezone เป็นอะไร
const BANGKOK_OFFSET = '+07:00';

const parseHHMM = (value: string): string | null => {
  const m = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
};

/** เวลาสิ้นสุดของรอบ (ถ้าข้อมูลเวลาผิดรูปแบบคืน null = ถือว่ายังไม่สิ้นสุด) */
export function sessionEndsAt(eventDate: string, startTime: string, endTime: string): Date | null {
  const end = parseHHMM(endTime);
  const start = parseHHMM(startTime);
  if (!end || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) return null;

  const endDate = new Date(`${eventDate}T${end}:00${BANGKOK_OFFSET}`);
  // รอบข้ามคืน (เช่น 22:00 - 01:00) สิ้นสุดวันถัดไป
  if (start && end <= start) endDate.setUTCDate(endDate.getUTCDate() + 1);
  return Number.isNaN(endDate.getTime()) ? null : endDate;
}

export const hasSessionEnded = (eventDate: string, startTime: string, endTime: string, now = new Date()) => {
  const endsAt = sessionEndsAt(eventDate, startTime, endTime);
  return endsAt !== null && endsAt.getTime() <= now.getTime();
};
