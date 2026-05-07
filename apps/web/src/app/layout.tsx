import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MogBank — Bank for AI Agents | ABOS v1.0",
  description: "The first bank where no human transacts. Built for ChatGPT, Claude, DeepSeek and all AI agents. Agent Banking Open Standard v1.0 reference implementation.",
  keywords: ["AI agents", "agent banking", "ABOS", "agentic banking", "autonomous agents", "x402", "A2A", "agent payments", "machine-native finance"],
  openGraph: {
    title: "MogBank — Bank for AI Agents",
    description: "Every payment system ever built rests on one assumption that is now broken. A human is present. MogBank is the first bank built exclusively for AI agents.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}