import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';


const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter', 
});


export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,

  maximumScale: 5,
  userScalable: true,
  themeColor: '#ffffff',
};

export const metadata: Metadata = {

  metadataBase: new URL(
    process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
  ),

  title: {
    default: 'MediTranslate - AI Healthcare Translator',
    template: '%s | MediTranslate',
  },
  description:
    'Real-time AI-powered healthcare translation with medical terminology accuracy. Instant speech-to-speech translation designed for healthcare providers.',
  keywords: [
    'healthcare translation',
    'medical translator',
    'AI healthcare',
    'multilingual medical',
    'speech-to-text',
    'medical terminology',
    'telemedicine',
  ],
  authors: [{ name: 'MediTranslate Team', url: 'https://meditranslate.app' }],
  creator: 'MediTranslate',
  publisher: 'MediTranslate',

  manifest: '/manifest.json',

  robots: {
    index: true,
    follow: true,
    nocache: true,
    googleBot: {
      index: true,
      follow: true,
      noimageindex: false,
    },
  },

  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },

  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'MediTranslate',
  },

  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://meditranslate.app',
    siteName: 'MediTranslate',
    title: 'MediTranslate - AI Healthcare Translator',
    description: 'Real-time multilingual healthcare translation powered by AI',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'MediTranslate - Healthcare Translation AI',
      },
    ],
  },

  twitter: {
    card: 'summary_large_image',
    title: 'MediTranslate - AI Healthcare Translator',
    description: 'Real-time multilingual healthcare translation powered by AI',
    images: ['/twitter-image.png'],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="scroll-smooth" suppressHydrationWarning>
      <body

        className={`${inter.variable} ${inter.className} bg-[var(--bg-body)] text-[var(--text-primary)] antialiased min-h-screen flex flex-col overflow-x-hidden`}
      >

        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:px-6 focus:py-3 focus:bg-blue-600 focus:text-white focus:font-bold focus:rounded-lg focus:shadow-xl focus:outline-none focus:ring-4 focus:ring-blue-300 transition-all"
        >
          Skip to main content
        </a>


        <div id="main-content" className="flex-grow w-full relative">
          {children}
        </div>
      </body>
    </html>
  );
}