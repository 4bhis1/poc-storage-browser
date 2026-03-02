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
import { getCurrentUser } from '@/lib/session'

const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });
const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const manrope = Manrope({ subsets: ['latin'], variable: '--font-manrope' });

export const metadata: Metadata = {
  title: 'CloudVault - Enterprise File Management',
  description: 'Secure multi-tenant file management powered by S3',
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const user = await getCurrentUser()

  const defaultPreferences = {
    themeMode: 'system',
    themeColor: 'blue',
    themeFont: 'inter',
    themeRadius: '0.3',
  }

  const prefs = {
    themeMode: user?.themeMode || defaultPreferences.themeMode,
    themeColor: user?.themeColor || defaultPreferences.themeColor,
    themeFont: user?.themeFont || defaultPreferences.themeFont,
    themeRadius: user?.themeRadius || defaultPreferences.themeRadius,
  }

  const radiusClass = `radius-${prefs.themeRadius.replace('.', '-')}`
  const themeClasses = `theme-${prefs.themeColor} font-${prefs.themeFont} ${radiusClass}`

  return (
    <html lang="en" suppressHydrationWarning className={themeClasses}>
      <body className={`font-sans antialiased ${inter.variable} ${manrope.variable}`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <AuthProvider>
            <UserPreferencesProvider initialPreferences={prefs}>
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
