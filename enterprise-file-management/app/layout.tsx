import type { Metadata } from 'next'
import { Geist, Geist_Mono, Inter, Manrope } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/sonner'
import './globals.css'
import { AuthProvider } from '@/components/providers/AuthProvider'
import { UploadProvider } from '@/components/providers/upload-provider'
import { GlobalUploadIndicator } from '@/components/global-upload-indicator'
import { DownloadProvider } from '@/components/providers/download-provider'
import { GlobalDownloadIndicator } from '@/components/global-download-indicator'
import { UserPreferencesProvider } from '@/components/providers/user-preferences-provider'

const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });
const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const manrope = Manrope({ subsets: ['latin'], variable: '--font-manrope' });

export const metadata: Metadata = {
  title: 'Datadock - Enterprise File Management',
  description: 'Secure multi-tenant file management powered by S3',
  icons: {
    icon: '/favicon.ico',
  },
}

// Hardcoded SSR defaults — actual preferences are loaded from localStorage on the client
const ssrPrefs = {
  themeMode: 'light',
  themeColor: 'blue',
  themeFont: 'inter',
  themeRadius: '0.3',
}

const radiusClass = `radius-${ssrPrefs.themeRadius.replace('.', '-')}`
const themeClasses = `theme-${ssrPrefs.themeColor} font-${ssrPrefs.themeFont} ${radiusClass}`

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={themeClasses}>
      <body className={`font-sans antialiased ${inter.variable} ${manrope.variable}`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <AuthProvider>
            <UserPreferencesProvider>
              <UploadProvider>
                <DownloadProvider>
                  {children}
                  <GlobalUploadIndicator />
                  <GlobalDownloadIndicator />
                  <Toaster />
                </DownloadProvider>
              </UploadProvider>
            </UserPreferencesProvider>
          </AuthProvider>
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  )
}
