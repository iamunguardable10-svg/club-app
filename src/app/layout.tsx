import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import { SyncStatusBanner } from '@/shared/components/SyncStatusBanner';
import { AccessGate } from '@/features/access/AccessGate';
import { ServiceWorkerRegistration } from '@/features/install/ServiceWorkerRegistration';
import { NoZoomInApp } from '@/features/install/NoZoomInApp';
import { LoginHandoff } from '@/features/install/LoginHandoff';
import { ErrorReporter } from '@/features/errors/ErrorReporter';
import { AccountLocaleSync } from '@/shared/i18n/AccountLocaleSync';

export const metadata: Metadata = {
  metadataBase: new URL('https://clubos.hebinova.de'),
  title: 'Club OS',
  description: 'A club operating system for coaches and athletes. Sign in with your club, or test locally without an account.',
  applicationName: 'Club OS',
  // Installed on an iPhone: its own window, the name under the icon, a dark status bar above the app.
  appleWebApp: { capable: true, title: 'Club OS', statusBarStyle: 'black' },
  icons: {
    icon: [
      { url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon.svg', type: 'image/svg+xml' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
  formatDetection: { telephone: false },
};


export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#050712',
};

// Inter, shipped with the app so every device shows the same letters (audit 2026-11, 9; OFL, see fonts/Inter-LICENSE.txt).
const inter = localFont({ src: './fonts/InterVariable-latin.woff2', weight: '100 900', display: 'swap', variable: '--font-inter' });

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        {children}
        <SyncStatusBanner />
        <AccessGate />
        <ServiceWorkerRegistration />
        <NoZoomInApp />
        <LoginHandoff />
        <AccountLocaleSync />
        <ErrorReporter />
      </body>
    </html>
  );
}
