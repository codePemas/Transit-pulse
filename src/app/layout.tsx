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
  title: "Transit Pulse | Buffalo City Fleet Management OS",
  description: "Buffalo City public transit tracking, wallet, and fleet operations platform",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#060913] text-slate-200">
        <div className="flex-1 flex flex-col">{children}</div>
        <footer className="w-full border-t border-slate-800/80 bg-[#060913]/90 py-3 px-4 text-center text-xs text-slate-400">
          Engineered &amp; Designed by Liyema Vanda
        </footer>
      </body>
    </html>
  );
}