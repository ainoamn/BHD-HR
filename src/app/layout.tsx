import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Arabic, Inter } from "next/font/google";
import { LangProvider } from "@/components/lang-provider";
import { getI18n } from "@/lib/lang";
import "./globals.css";

const plexArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-arabic",
  display: "swap",
});

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
    title: t("نظام الموظفين والرواتب", "Employees & Payroll"),
    description: t("إدارة بيانات الموظفين والرواتب والغياب والمستندات", "Manage employees, payroll, leave and documents"),
  };
}

export const viewport: Viewport = {
  themeColor: "#092d24",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { lang } = await getI18n();
  return (
    <html lang={lang} dir={lang === "en" ? "ltr" : "rtl"} className={`${inter.variable} ${plexArabic.variable}`}>
      <body className="min-h-dvh antialiased">
        <LangProvider lang={lang}>{children}</LangProvider>
      </body>
    </html>
  );
}
