import type { Metadata } from 'next';
import './globals.css';
import { ThemeProvider } from '@/lib/theme';
import { dashboardConfig } from '@/lib/config';
import { isDemoMode } from '@/lib/runtime-mode';
import { DemoModeBanner } from '@/components/demo-mode-banner';

export const metadata: Metadata = {
  title: dashboardConfig.name,
  description: dashboardConfig.description,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Spec 024 / FR-016: detect demo mode at request time. The banner is
  // mounted in the root layout (not the dashboard page) so it persists
  // across navigation. Returns null when not in demo mode — production
  // is unaffected.
  const demoMode = isDemoMode();
  return (
    <html lang="en" data-theme="dark" data-demo-mode={demoMode ? 'true' : 'false'}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="antialiased" style={{ fontFamily: "'Inter', sans-serif" }}>
        <ThemeProvider>
          {/* Spec 024 / FR-016: permanent site-wide banner. Server-rendered.
              Sits above {children} so it is the first thing the user sees. */}
          <DemoModeBanner demoMode={demoMode} />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}