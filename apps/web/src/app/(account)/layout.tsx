import { DM_Sans, Manrope } from "next/font/google";

const dmSans = DM_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-dm-sans" });
const manrope = Manrope({ subsets: ["latin", "cyrillic"], weight: ["600", "700", "800"], variable: "--font-manrope" });

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${dmSans.variable} ${manrope.variable}`}>{children}</div>;
}
