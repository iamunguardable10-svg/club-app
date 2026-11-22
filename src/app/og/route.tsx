import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import { joinPreview, previewLocale } from '@/features/share/linkPreview';
import { translate } from '@/shared/i18n/translate';

/**
 * The picture in a link preview (1200 × 630, what WhatsApp, iMessage, Slack
 * and mail apps show). `?code=` draws the team behind a join code, read on
 * the server (never names from the address, so nobody can put other text on
 * our picture); without it, or for an invitation, the plain Club OS card.
 */
const ASSETS = join(process.cwd(), 'src/app/og/assets');
// Inter like the app (OFL, src/app/fonts/Inter-LICENSE.txt), and the app's own icon.
const loaded = Promise.all([readFile(join(ASSETS, 'Inter-700.ttf')), readFile(join(ASSETS, 'Inter-800.ttf')), readFile(join(ASSETS, 'icon.png'))]);

export async function GET(request: Request) {
  const [bold, extraBold, icon] = await loaded;
  const iconSrc = `data:image/png;base64,${icon.toString('base64')}`;
  const params = new URL(request.url).searchParams;
  const locale = previewLocale(params.get('lang') ?? undefined);
  const code = params.get('code');
  const team = code ? await joinPreview(code) : null;
  const kicker = team ? team.club : 'clubos.hebinova.de';
  const headline = team ? translate(locale, 'preview.join.title', { team: team.team }) : translate(locale, 'preview.default.headline');
  const line = translate(locale, 'preview.image.line');

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '64px 72px', backgroundColor: '#0b0f14', backgroundImage: 'radial-gradient(circle at 85% 10%, rgba(52,211,153,0.28), rgba(11,15,20,0) 55%)', color: '#f8fafc', fontFamily: 'Inter' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: 8, color: '#6ee7b7' }}>CLUB OS</div>
          {/* eslint-disable-next-line @next/next/no-img-element -- drawn into the preview picture, not a page */}
          <img src={iconSrc} width={76} height={76} alt="" style={{ borderRadius: 20 }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 40 }}>
          {team ? (
            <div style={{ display: 'flex', width: 180, height: 180, flexShrink: 0, borderRadius: 44, background: 'rgba(110,231,183,0.14)', alignItems: 'center', justifyContent: 'center', color: '#6ee7b7', fontSize: 96, fontWeight: 800 }}>
              {team.team.slice(0, 1).toUpperCase()}
            </div>
          ) : null}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: team ? 820 : 1050 }}>
            <div style={{ fontSize: 30, fontWeight: 700, color: '#6ee7b7' }}>{kicker}</div>
            <div style={{ fontSize: team ? 76 : 84, fontWeight: 800, lineHeight: 1.05, letterSpacing: -1.5 }}>{headline}</div>
          </div>
        </div>
        <div style={{ display: 'flex', fontSize: 30, color: '#94a3b8' }}>{line}</div>
      </div>
    ),
    { width: 1200, height: 630, fonts: [{ name: 'Inter', data: bold, weight: 700, style: 'normal' }, { name: 'Inter', data: extraBold, weight: 800, style: 'normal' }], headers: { 'Cache-Control': 'public, max-age=600, s-maxage=600' } },
  );
}
