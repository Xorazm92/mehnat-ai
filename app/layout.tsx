import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";

const inter = Inter({ subsets: ["latin"] });

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://asro.uz";
const TITLE = "ASRO — Korporativ Boshqaruv Tizimi";
const DESCRIPTION =
  "Firmalar, xodimlar, KPI, kassa va hisobotlarni yagona, xavfsiz platformada boshqaring — ASRO.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: "%s · ASRO",
  },
  description: DESCRIPTION,
  applicationName: "ASRO",
  authors: [{ name: "ASRO" }],
  keywords: ["ASRO", "ERP", "buxgalteriya", "KPI", "firmalar", "kassa", "hisobot"],
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-32x32.png", type: "image/png", sizes: "32x32" },
      { url: "/favicon-16x16.png", type: "image/png", sizes: "16x16" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    shortcut: ["/favicon.ico"],
  },
  appleWebApp: {
    capable: true,
    title: "ASRO",
    statusBarStyle: "black-translucent",
  },
  openGraph: {
    type: "website",
    siteName: "ASRO",
    title: TITLE,
    description: DESCRIPTION,
    locale: "uz_UZ",
    url: "/",
    images: [{ url: "/og-image.jpg", width: 1200, height: 630, alt: "ASRO — Korporativ Boshqaruv Tizimi" }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/og-image.jpg"],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0f17" },
  ],
  colorScheme: "light dark",
};

import { ThemeProvider } from "@/components/ThemeProvider";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="uz" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster richColors position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
