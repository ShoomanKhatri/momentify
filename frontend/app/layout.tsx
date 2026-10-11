import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Providers } from "@/components/providers";
import { Workspace } from "@/components/workspace";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Momentify — Momentum, measured.",
    template: "%s · Momentify",
  },
  description:
    "A focused workspace for Solana momentum strategies and paper trading.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
    >
      <body>
        <Providers>
          <Workspace>{children}</Workspace>
        </Providers>
      </body>
    </html>
  );
}
