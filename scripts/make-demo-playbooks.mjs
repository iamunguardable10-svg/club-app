// Draws the demo club's example playbooks (basketball half court, players 1–5,
// cuts, passes, dribbles) and prints them to PDF with Chromium:
//   node scripts/make-demo-playbooks.mjs
// Written to public/demo/playbooks/. Our own drawings, so there is no licence
// to track; small files (a few KB each).
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const OUT = path.join(process.cwd(), 'public', 'demo', 'playbooks');

// Court 500 × 470 (half court, basket at the top).
function court() {
  return `
    <rect x="0" y="0" width="500" height="470" fill="#f6efe2" stroke="#1f2937" stroke-width="4"/>
    <rect x="170" y="0" width="160" height="190" fill="#f2d7b0" stroke="#1f2937" stroke-width="3"/>
    <circle cx="250" cy="190" r="60" fill="none" stroke="#1f2937" stroke-width="3"/>
    <path d="M30 0 V140 A225 225 0 0 0 470 140 V0" fill="none" stroke="#1f2937" stroke-width="3"/>
    <line x1="220" y1="40" x2="280" y2="40" stroke="#1f2937" stroke-width="4"/>
    <circle cx="250" cy="52" r="9" fill="none" stroke="#c2410c" stroke-width="3"/>
    <path d="M190 470 A60 60 0 0 1 310 470" fill="none" stroke="#1f2937" stroke-width="3"/>`;
}

const player = (n, x, y, ball = false) => `
  <circle cx="${x}" cy="${y}" r="17" fill="#ffffff" stroke="#0f172a" stroke-width="3"/>
  <text x="${x}" y="${y + 7}" font-size="20" font-weight="700" text-anchor="middle" fill="#0f172a">${n}</text>
  ${ball ? `<circle cx="${x + 16}" cy="${y - 16}" r="6" fill="#ea580c"/>` : ''}`;

const defender = (x, y) => `<text x="${x}" y="${y + 8}" font-size="26" font-weight="700" text-anchor="middle" fill="#b91c1c">X</text>`;

const cut = (d) => `<path d="${d}" fill="none" stroke="#0f172a" stroke-width="3" marker-end="url(#arrow)"/>`;
const pass = (d) => `<path d="${d}" fill="none" stroke="#0f172a" stroke-width="3" stroke-dasharray="9 7" marker-end="url(#arrow)"/>`;
const screen = (x1, y1, x2, y2) => {
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy), nx = -dy / len * 14, ny = dx / len * 14;
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#0f172a" stroke-width="3"/><line x1="${x2 - nx}" y1="${y2 - ny}" x2="${x2 + nx}" y2="${y2 + ny}" stroke="#0f172a" stroke-width="4"/>`;
};
function dribble(points) {
  // A zig-zag along the straight segments.
  let d = `M${points[0][0]} ${points[0][1]}`;
  for (let i = 1; i < points.length; i += 1) {
    const [x1, y1] = points[i - 1], [x2, y2] = points[i];
    const steps = Math.max(4, Math.round(Math.hypot(x2 - x1, y2 - y1) / 14));
    for (let s = 1; s <= steps; s += 1) {
      const t = s / steps, x = x1 + (x2 - x1) * t, y = y1 + (y2 - y1) * t;
      const off = s === steps ? 0 : (s % 2 ? 7 : -7);
      const len = Math.hypot(x2 - x1, y2 - y1);
      d += ` L${x + (-(y2 - y1) / len) * off} ${y + ((x2 - x1) / len) * off}`;
    }
  }
  return `<path d="${d}" fill="none" stroke="#0f172a" stroke-width="3" marker-end="url(#arrow)"/>`;
}

const frame = (title, step, note, body) => `
  <section class="page">
    <header><h1>${title}</h1><p class="step">${step}</p></header>
    <svg viewBox="-10 -10 520 490" width="100%">
      <defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#0f172a"/></marker></defs>
      ${court()}
      ${body}
    </svg>
    <p class="note">${note}</p>
    <footer>Club OS · demo playbook · solid line = cut, dashed = pass, zig-zag = dribble, T = screen</footer>
  </section>`;

const PLAYBOOKS = {
  'horns.pdf': [
    frame('Horns', 'Phase 1 – set and entry', '4 and 5 at the elbows, 2 and 3 in the corners. 1 brings the ball up the middle and passes to 5.',
      player(1, 250, 400, true) + player(2, 50, 60) + player(3, 450, 60) + player(4, 175, 190) + player(5, 325, 190)
      + dribble([[250, 400], [250, 300]]) + pass('M265 292 L312 205')),
    frame('Horns', 'Phase 2 – screen and roll', '4 sets a screen for 1, who cuts to the basket. 5 looks for 1 or hands off to 4 popping out.',
      player(1, 250, 300) + player(2, 50, 60) + player(3, 450, 60) + player(4, 175, 190) + player(5, 325, 190, true)
      + screen(175, 190, 225, 270) + cut('M250 300 Q215 230 230 95') + cut('M175 190 L150 300')),
  ],
  'press-122.pdf': [
    frame('1-2-2 press', 'Set-up after a made basket', '1 pressures the inbound, 2 and 3 take the wings, 4 and 5 stay back. Push the ball to the side line, then trap.',
      defender(250, 330) + defender(130, 260) + defender(370, 260) + defender(160, 120) + defender(340, 120)
      + cut('M130 260 L95 330') + cut('M250 330 L150 370')),
    frame('1-2-2 press', 'Trap on the side line', '1 and 2 trap the ball near the side line. 3 cuts off the middle pass, 4 takes the side line, 5 protects the basket.',
      defender(110, 360) + defender(70, 330) + defender(260, 300) + defender(90, 170) + defender(250, 110)
      + cut('M370 260 L270 295') + cut('M160 120 L100 165') + cut('M340 120 L260 110')),
  ],
  'ato-sideline.pdf': [
    frame('ATO side line', 'Out of bounds on the side line', 'After a time-out: 2 inbounds. 5 screens for 3, who cuts to the ball. 1 is the safety.',
      player(2, 495, 250, true) + player(3, 330, 130) + player(5, 380, 200) + player(4, 160, 140) + player(1, 250, 400)
      + screen(380, 200, 345, 160) + cut('M330 130 Q400 170 430 240') + pass('M480 250 L445 245')),
  ],
};

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [file, pages] of Object.entries(PLAYBOOKS)) {
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: A4; margin: 14mm; }
    body { font-family: Helvetica, Arial, sans-serif; color: #0f172a; margin: 0; }
    .page { page-break-after: always; display: flex; flex-direction: column; gap: 10px; }
    .page:last-child { page-break-after: auto; }
    header { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 3px solid #0f172a; padding-bottom: 6px; }
    h1 { font-size: 26px; margin: 0; } .step { margin: 0; font-size: 14px; font-weight: 700; color: #475569; }
    .note { font-size: 15px; line-height: 1.45; margin: 4px 0 0; }
    footer { font-size: 10px; color: #64748b; margin-top: 4px; }
  </style></head><body>${pages.join('')}</body></html>`);
  await page.pdf({ path: path.join(OUT, file), format: 'A4', printBackground: true });
  console.log('wrote', file, fs.statSync(path.join(OUT, file)).size, 'bytes');
}
await browser.close();
