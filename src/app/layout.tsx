import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono-face",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Taxora — GST reconciliation for CA firms",
    template: "%s · Taxora",
  },
  description:
    "Taxora reconciles GSTR-2B with your purchase register, explains every match and discrepancy, and keeps a full audit trail for review.",
  applicationName: "Taxora",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-IN" data-scroll-behavior="smooth" className={`${inter.variable} ${mono.variable}`}>
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
