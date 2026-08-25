import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Pulso - Juega y pasa',
  description: 'Un duelo de cartas local para dos jugadores.',
  openGraph: {
    title: 'Pulso - Juega y pasa',
    description: 'Un duelo de cartas local para dos jugadores.',
    type: 'website',
    images: [{ url: '/og.png', width: 1736, height: 907, alt: 'Pulso - Juega y pasa' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Pulso - Juega y pasa',
    description: 'Un duelo de cartas local para dos jugadores.',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
