import 'dotenv/config';
import app from './app.js';
import { markOverdueNoShows } from './services/noShow.js';

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`✅ Server is running on http://localhost:${PORT}`);
});

// กวาดตั๋วที่เลยเวลารอบแต่ไม่ได้เช็คอินให้เป็น NO_SHOW ทุก 5 นาที
// (การจอง/สแกนก็ตรวจซ้ำแบบ lazy อยู่แล้ว งานนี้ทำให้ dashboard ของผู้จัดงานเป็นปัจจุบัน)
const sweep = () =>
  markOverdueNoShows()
    .then((n) => n > 0 && console.log(`⏱️ mark ${n} booking(s) as NO_SHOW`))
    .catch((err) => console.error('no-show sweep failed:', err));
sweep();
setInterval(sweep, 5 * 60 * 1000).unref();