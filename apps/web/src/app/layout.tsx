import { Toaster, TooltipProvider } from '@snapsell/ui';
import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';
import type { Metadata, Viewport } from 'next';
import { ThemeBootstrapScript } from '@/components/providers/theme-bootstrap-script';
import { ThemeProvider } from '@/components/providers/theme-provider';
import {
  getThemeInitScript,
  themeProviderProps,
} from '@/components/providers/theme-script';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'SnapSell', template: '%s · SnapSell' },
  description: 'Shop online or order on WhatsApp.',
  applicationName: 'SnapSell',
  appleWebApp: { capable: true, title: 'SnapSell', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fafafa' },
    { media: '(prefers-color-scheme: dark)', color: '#09090b' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const themeScript = getThemeInitScript({
    attribute: themeProviderProps.attribute,
    defaultTheme: themeProviderProps.defaultTheme,
    enableSystem: themeProviderProps.enableSystem,
  });

  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-dvh">
        <ThemeBootstrapScript script={themeScript} />
        <ThemeProvider {...themeProviderProps}>
          <TooltipProvider>
            {children}
            <Toaster />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
