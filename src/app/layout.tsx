import type { Metadata } from "next";
import { LangProvider } from "@/components/lang-provider";
import { getI18n } from "@/lib/lang";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
    title: t("نظام الموظفين والرواتب", "Employees & Payroll"),
    description: t("إدارة بيانات الموظفين والرواتب والغياب والمستندات", "Manage employees, payroll, leave and documents"),
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { lang } = await getI18n();
  return (
    <html lang={lang} dir={lang === "en" ? "ltr" : "rtl"}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen antialiased">
        <LangProvider lang={lang}>{children}</LangProvider>
      </body>
    </html>
  );
}
