import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import { joinPreview, previewLocale } from '@/features/share/linkPreview';
import { translate } from '@/shared/i18n/translate';

/**
 * The picture in a link preview (1200 × 630, what WhatsApp, iMessage, Slack
 * and mail apps show).
 * - `?code=`: the team behind a join code, read on the server (never names
 *   from the address, so nobody can put other text on our picture).
 * - Otherwise (home page, invitation, any page): the headline with three
 *   real screens of the app (Today, Load, Messages; Ben, 2026-11-24: "better
 *   than the calendar").
 */
const ASSETS = join(process.cwd(), 'src/app/og/assets');
const asDataUrl = (file: Buffer) => `data:image/png;base64,${file.toString('base64')}`;
// Inter like the app (OFL, src/app/fonts/Inter-LICENSE.txt), the app's icon and three screens (German demo).
const loaded = Promise.all([
  readFile(join(ASSETS, 'Inter-700.ttf')),
  readFile(join(ASSETS, 'Inter-800.ttf')),
  readFile(join(ASSETS, 'icon.png')),
  ...['shot-today.png', 'shot-load.png', 'shot-messages.png'].map((name) => readFile(join(ASSETS, name))),
]);

const BACKGROUND = { backgroundColor: '#0b0f14', backgroundImage: 'radial-gradient(circle at 85% 10%, rgba(52,211,153,0.28), rgba(11,15,20,0) 55%)' };

/** One phone: the top of a screen in a rounded frame. */
function Phone({ src, left, top, rotate, z }: { src: string; left: number; top: number; rotate: number; z: number }) {
  return (
    <div style={{ position: 'absolute', left, top, display: 'flex', width: 236, height: 470, borderRadius: 34, padding: 7, background: '#1e293b', boxShadow: '0 30px 60px rgba(0,0,0,0.55)', transform: `rotate(${rotate}deg)`, zIndex: z, overflow: 'hidden' }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- drawn into the preview picture, not a page */}
      <img src={src} width={222} height={480} alt="" style={{ borderRadius: 28, objectFit: 'cover', objectPosition: 'top' }} />
    </div>
  );
}

export async function GET(request: Request) {
  const [bold, extraBold, icon, today, load, messages] = await loaded;
  const params = new URL(request.url).searchParams;
  const locale = previewLocale(params.get('lang') ?? undefined);
  const code = params.get('code');
  const team = code ? await joinPreview(code) : null;
  const line = translate(locale, 'preview.image.line');
  const fonts = [{ name: 'Inter', data: bold, weight: 700 as const, style: 'normal' as const }, { name: 'Inter', data: extraBold, weight: 800 as const, style: 'normal' as const }];
  const options = { width: 1200, height: 630, fonts, headers: { 'Cache-Control': 'public, max-age=600, s-maxage=600' } };
  const brand = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- drawn into the preview picture, not a page */}
      <img src={asDataUrl(icon)} width={64} height={64} alt="" style={{ borderRadius: 18 }} />
      <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: 7, color: '#6ee7b7' }}>CLUB OS</div>
    </div>
  );

  if (team) {
    return new ImageResponse(
      (
        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '64px 72px', ...BACKGROUND, color: '#f8fafc', fontFamily: 'Inter' }}>
          {brand}
          <div style={{ display: 'flex', alignItems: 'center', gap: 40 }}>
            <div style={{ display: 'flex', width: 180, height: 180, flexShrink: 0, borderRadius: 44, background: 'rgba(110,231,183,0.14)', alignItems: 'center', justifyContent: 'center', color: '#6ee7b7', fontSize: 96, fontWeight: 800 }}>
              {team.team.slice(0, 1).toUpperCase()}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 820 }}>
              <div style={{ fontSize: 30, fontWeight: 700, color: '#6ee7b7' }}>{team.club}</div>
              <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.05, letterSpacing: -1.5 }}>{translate(locale, 'preview.join.title', { team: team.team })}</div>
            </div>
          </div>
          <div style={{ display: 'flex', fontSize: 30, color: '#94a3b8' }}>{line}</div>
        </div>
      ),
      options,
    );
  }

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', position: 'relative', ...BACKGROUND, color: '#f8fafc', fontFamily: 'Inter', overflow: 'hidden' }}>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: 560, padding: '64px 0 64px 72px' }}>
          {brand}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
            {/* "Dein Team, / an einem Ort.": the break after the comma, like the landing page. */}
            <div style={{ display: 'flex', flexDirection: 'column', fontSize: 72, fontWeight: 800, lineHeight: 1.04, letterSpacing: -1.5 }}>
              {translate(locale, 'preview.default.headline').split(/(?<=,)\s+/).map((part) => <div key={part}>{part}</div>)}
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.35, color: '#94a3b8' }}>{line}</div>
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color: '#6ee7b7' }}>clubos.hebinova.de</div>
        </div>
        <Phone src={asDataUrl(load)} left={620} top={120} rotate={-7} z={1} />
        <Phone src={asDataUrl(messages)} left={930} top={120} rotate={7} z={1} />
        <Phone src={asDataUrl(today)} left={770} top={70} rotate={0} z={2} />
      </div>
    ),
    options,
  );
}
