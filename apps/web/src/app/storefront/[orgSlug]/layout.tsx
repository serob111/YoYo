import type { Metadata } from "next";
import { DM_Sans, Manrope } from "next/font/google";
import { getI18n } from "@/lib/i18n/server";

const dmSans = DM_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-dm-sans" });
const manrope = Manrope({ subsets: ["latin", "cyrillic"], weight: ["600", "700", "800"], variable: "--font-manrope" });

export function generateMetadata(): Metadata {
  const { t } = getI18n();
  return { title: t("Listings"), description: t("Browse available properties and book a viewing.") };
}

export default function StorefrontLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${dmSans.variable} ${manrope.variable}`}>{children}</div>;
}
