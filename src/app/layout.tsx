import type { Metadata, Viewport } from 'next';
import './globals.css';
import { SyncStatusBanner } from '@/shared/components/SyncStatusBanner';
import { AccessGate } from '@/features/access/AccessGate';

export const metadata: Metadata = {
  title: 'Club App / TeamLoad OS',
  description: 'A club operating system for coaches and athletes. Sign in with your club, or test locally without an account.',
};


export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {children}
        <SyncStatusBanner />
        <AccessGate />
      </body>
    </html>
  );
}
