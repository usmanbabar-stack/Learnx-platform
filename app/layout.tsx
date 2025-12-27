import type React from "react"
import type { Metadata } from "next"
import { Montserrat } from "next/font/google"
import { Open_Sans } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import Script from "next/script"
import "./globals.css"
import { Suspense } from "react"
import { ThemeProvider } from "@/components/theme-provider"
// Remove this line:
// import { MouseTrail } from "@/components/mouse-trail"

const montserrat = Montserrat({
  subsets: ["latin"],
  variable: "--font-montserrat",
  display: "swap",
})

const openSans = Open_Sans({
  subsets: ["latin"],
  variable: "--font-open-sans",
  display: "swap",
})

export const metadata: Metadata = {
  title: "LEARNX - AI-Powered Video Learning Assistant",
  description:
    "Transform passive video watching into interactive learning with AI-powered chatbots and personalized education tools.",
  generator: "v0.app",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Preload YouTube IFrame API */}
        <link rel="preconnect" href="https://www.youtube.com" />
        <link rel="dns-prefetch" href="https://www.youtube.com" />
      </head>
      <body className={`font-sans ${montserrat.variable} ${openSans.variable} antialiased`}>
        {/* Load YouTube IFrame API globally - CRITICAL for custom player */}
        <Script
          src="https://www.youtube.com/iframe_api"
          strategy="afterInteractive"
          id="youtube-iframe-api"
        />
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {/* Remove this line: <MouseTrail /> */}
          <Suspense fallback={null}>{children}</Suspense>
          <Analytics />
        </ThemeProvider>
      </body>
    </html>
  )
}