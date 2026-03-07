import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { CustomCursor } from "@/components/ui/CustomCursor";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Larry — The AI Project Manager That Actually Runs Execution",
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
      <body className={`${geistSans.variable} antialiased`}>
        <CustomCursor />
        {children}
      </body>
    </html>
  );
}
