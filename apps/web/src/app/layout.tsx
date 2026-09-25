import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Providers } from "./providers";
import { getI18n } from "@/lib/i18n/server";
import "./globals.css";

const inter = Inter({ subsets: ["latin", "cyrillic"], variable: "--font-inter" });

export function generateMetadata(): Metadata {
  const { t } = getI18n();
  return {
    title: t("YoYo — AI Lead Conversion Platform for Real Estate Teams"),
    description: t("You bring the leads. YoYo turns them into conversations, viewings and deals.")
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const { locale } = getI18n();
  return (
    <html lang={locale} className={`${inter.variable} font-sans`}>
      <body>
        <Providers locale={locale}>{children}</Providers>
      </body>
    </html>
  );
}
