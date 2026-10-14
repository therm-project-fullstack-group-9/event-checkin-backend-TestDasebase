import bcrypt from 'bcryptjs';

// cost 10 = สมดุลระหว่างความปลอดภัยกับความเร็ว (bcryptjs เป็น pure JS ไม่ต้อง build native)
const SALT_ROUNDS = 10;

export const hashPassword = (plain: string) => bcrypt.hash(plain, SALT_ROUNDS);

// คืน false เสมอถ้าผู้ใช้ไม่มีรหัสผ่าน (เช่น สมัครผ่าน OAuth) หรือ hash ไม่ใช่รูปแบบ bcrypt
export const verifyPassword = async (plain: string, hash: string | null | undefined) => {
  if (!hash) return false;
  return bcrypt.compare(plain, hash);
};
