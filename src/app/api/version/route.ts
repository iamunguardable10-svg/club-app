/**
 * The build this server runs, so an app still open from an older deploy can
 * notice it and load the new one (see `src/features/install/buildVersion.ts`).
 */

export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({ version: process.env.NEXT_PUBLIC_APP_VERSION ?? 'local' }, { headers: { 'Cache-Control': 'no-store' } });
}
