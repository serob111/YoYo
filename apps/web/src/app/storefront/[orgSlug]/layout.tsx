import type { Metadata } from "next";
import { DM_Sans, Manrope } from "next/font/google";

const dmSans = DM_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-dm-sans" });
const manrope = Manrope({ subsets: ["latin", "cyrillic"], weight: ["600", "700", "800"], variable: "--font-manrope" });

export const metadata: Metadata = {
  title: "Listings",
  description: "Browse available properties and book a viewing."
};

export default function StorefrontLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${dmSans.variable} ${manrope.variable}`}>{children}</div>;
}
