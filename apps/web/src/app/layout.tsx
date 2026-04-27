import type { Metadata } from "next";
import { Inter, Geist } from "next/font/google";
import "./globals.css";
import CsrfFetchInstaller from "@/components/CsrfFetchInstaller";
import { OverlayManager } from "@/components/ui/LiquidOverlay";

const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-inter",
  display: "swap",
});

const geistSans = Geist({
  subsets: ["latin"],
  weight: ["300"],
  variable: "--font-geist-sans",
  display: "swap",
});

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  title: "Larry",
  description:
    "Larry listens across your stack, decides what needs to happen, drafts it in your voice, and ships it. Stop managing work. Start delivering it.",
  openGraph: {
    title: "Larry — Making projects run themselves",
    description:
      "Larry listens across your stack, decides what needs to happen, drafts it in your voice, and ships it.",
    url: "https://larry-pm.com",
    siteName: "Larry",
    images: [{ url: "/Larry_logo.png", width: 400, height: 400, alt: "Larry" }],
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Larry — Making projects run themselves",
    description:
      "Larry listens across your stack, decides what needs to happen, drafts it in your voice, and ships it.",
    images: ["/Larry_logo.png"],
  },
  icons: { icon: "/Larry_logo.png" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} ${geistSans.variable} antialiased`}
        suppressHydrationWarning
      >
        <CsrfFetchInstaller />
        <OverlayManager />
        {children}
      </body>
    </html>
  );
}
