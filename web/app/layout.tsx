import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";

import { KopiProvider } from "@/components/kopi-provider";
import { AppShell } from "@/components/shell/app-shell";
import { TooltipProvider } from "@/components/ui/tooltip";

import "./globals.css";

// The optical-size axis sets large type in Inter Display: tighter and finer at heading sizes.
const sans = Inter({ variable: "--font-sans", subsets: ["latin"], axes: ["opsz"] });
const mono = Geist_Mono({ variable: "--font-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Kopi", template: "%s · Kopi" },
  description: "A copilot for Singapore government tenders.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-SG" className={`${sans.variable} ${mono.variable} antialiased`}>
      <body className="min-h-dvh bg-frame">
        <KopiProvider>
          <TooltipProvider>
            <AppShell>{children}</AppShell>
          </TooltipProvider>
        </KopiProvider>
      </body>
    </html>
  );
}
