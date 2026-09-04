import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://messiah-land-map.sturdy-pike-6678.chatgpt.site'),
  title: '弥赛亚之地｜耶稣时代以色列 3D 互动地图',
  description: '探索公元一世纪从腓尼基到犹太、从地中海到低加波利的立体地形，在真实高差中重走福音书地点。',
  openGraph: {
    title: '弥赛亚之地｜耶稣时代以色列 3D 互动地图',
    description: '转动地形，沿着福音书的记载，重新理解故事发生的距离与地貌。',
    type: 'website',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: '弥赛亚之地：耶稣时代以色列 3D 互动地图' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: '弥赛亚之地｜耶稣时代以色列 3D 互动地图',
    description: '转动地形，沿着福音书的记载，重新理解故事发生的距离与地貌。',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
