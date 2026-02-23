import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/sonner'
import './globals.css'
import { AuthProvider } from '@/components/providers/AuthProvider'
import { UploadProvider } from '@/components/providers/upload-provider'
import { GlobalUploadIndicator } from '@/components/global-upload-indicator'
import { DownloadProvider } from '@/components/providers/download-provider'
import { GlobalDownloadIndicator } from '@/components/global-download-indicator'

const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: 'CloudVault - Enterprise File Management',
  description: 'Secure multi-tenant file management powered by S3',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <AuthProvider>
            <UploadProvider>
              <DownloadProvider>
                {children}
                <GlobalUploadIndicator />
                <GlobalDownloadIndicator />
                <Toaster />
              </DownloadProvider>
            </UploadProvider>
          </AuthProvider>
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  )
}
