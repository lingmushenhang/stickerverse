import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title:       'STICKERVERSE MUSEUM 1.0 — Imperial Vault Exhibition',
  description: '絶望を錬金する技術。Turning Misery into Luxury. IQ154 Certified.',
  keywords:    ['stickerverse', 'museum', 'imperial vault', 'causality puzzle', 'gacha'],
  authors:     [{ name: 'Emperor · IQ154' }],
  openGraph: {
    title:       'STICKERVERSE MUSEUM 1.0',
    description: '絶望を錬金する技術。Holy Relic Exhibition.',
    type:        'website',
    locale:      'ja_JP',
  },
  twitter: {
    card:        'summary_large_image',
    title:       'STICKERVERSE MUSEUM 1.0',
    description: '絶望を錬金する技術。Holy Relic Exhibition.',
  },
  robots: {
    index:  true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width:        'device-width',
  initialScale: 1,
  themeColor:   '#000008',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
