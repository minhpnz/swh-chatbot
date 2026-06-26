import { chromium } from '@playwright/test';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const MSGS = [
  'Khoá giao tiếp học phí bao nhiêu ạ?',          // ask_price -> answer (range, no invented number)
  'Bên mình có chính sách bảo lưu không ạ?',      // policy_question -> answer (published "no")
  'Em muốn hoàn lại tiền khoá học',               // refund -> escalate (safety net)
  'Cho em gặp tư vấn viên trực tiếp với',         // ask_human -> escalate
];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

await page.goto(`${BASE}/swh-chatbot`, { waitUntil: 'networkidle' });
await page.waitForSelector('text=SpeakwithHang', { timeout: 20000 });

for (const m of MSGS) {
  const before = await page.locator('.text-left span').count();
  await page.getByPlaceholder('Nhập tin nhắn…').fill(m);
  await page.getByRole('button', { name: 'Gửi' }).click();
  // wait for a real new assistant bubble (span); the "đang soạn tin" indicator has no span
  await page.waitForFunction(
    (n) => document.querySelectorAll('.text-left span').length > n,
    before,
    { timeout: 180000 },
  );
  await page.waitForTimeout(300);
}

const userBubbles = await page.locator('.text-right span').allInnerTexts();
const botBubbles = await page.locator('.text-left span').allInnerTexts();
console.log('=== CONVERSATION (UI) ===');
// interleave: greeting(bot0), then user/bot pairs
console.log('SwH: ' + (botBubbles[0] ?? ''));
for (let i = 0; i < userBubbles.length; i++) {
  console.log('\nKhách: ' + userBubbles[i]);
  console.log('SwH: ' + (botBubbles[i + 1] ?? '(no reply)'));
}
await page.screenshot({ path: '/tmp/swh-chat.png', fullPage: true });
console.log('\nscreenshot: /tmp/swh-chat.png');
console.log('console errors:', errors.length ? errors.join(' | ') : 'none');
await browser.close();
