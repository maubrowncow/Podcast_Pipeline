import type { Metadata } from "next";
import { Space_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { HealthIndicator } from "@/components/health-indicator";

const spaceMono = Space_Mono({
  variable: "--font-space-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: "Podcast Pipeline",
  description: "Podcast transcription and content pipeline",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${spaceMono.variable} antialiased`}>
        <header className="border-b border-border px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link
              href="/"
              className="text-xs font-bold uppercase tracking-[0.14em] text-foreground hover:text-accent transition-colors flex items-center gap-2"
            >
              <span className="inline-block w-2 h-2 rounded-full bg-accent" />
              Podcast Pipeline
            </Link>
            <nav className="flex gap-6">
              <Link
                href="/"
                data-slot="bracket-btn"
                className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground hover:text-accent transition-colors"
              >
                Dashboard
              </Link>
              <Link
                href="/upload"
                data-slot="bracket-btn"
                className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground hover:text-accent transition-colors"
              >
                Upload
              </Link>
            </nav>
          </div>
          <HealthIndicator />
        </header>
        <main className="max-w-5xl mx-auto px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
