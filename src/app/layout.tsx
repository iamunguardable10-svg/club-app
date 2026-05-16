import type { Metadata } from 'next';
import { GeoapifyAddressEnhancer } from '@/shared/components/places/GeoapifyAddressEnhancer';
import './globals.css';
import './landing-sticky.css';

export const metadata: Metadata = {
  title: 'Club App / TeamLoad OS',
  description: 'A club operating system for admins, coaches and athletes.',
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
