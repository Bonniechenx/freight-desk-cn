import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.OPENAI_SITE_URL ?? 'http://localhost:3000'),
  title: '运费核算台｜报价规则与批量计费',
  description: '面向快递、电商与云仓的网页版运费报价、批量核算和费用解释工具。',
  openGraph: {
    title: '运费核算台',
    description: '报价规则 · 批量核算 · 费用可解释',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: '运费核算台' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: '运费核算台',
    description: '报价规则 · 批量核算 · 费用可解释',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>{children}</body></html>;
}
