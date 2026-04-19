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
    "Larry autonomously manages follow-ups, updates, dependencies, and alignment — so your team can focus on delivering outcomes.",
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
