import type { Metadata, Viewport } from 'next';
import { GeoapifyAddressEnhancer } from '@/shared/components/places/GeoapifyAddressEnhancer';
import './globals.css';

export const metadata: Metadata = {
  title: 'Club App / TeamLoad OS',
  description: 'A club operating system for admins, coaches and athletes.',
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
        <GeoapifyAddressEnhancer />
        {children}
      </body>
    </html>
  );
}
