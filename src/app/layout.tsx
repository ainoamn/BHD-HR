import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Arabic, Inter } from "next/font/google";
import { cookies } from "next/headers";
import Script from "next/script";
import { TranslateProvider } from "@/components/ai-translate";
import { BhdSilentSso } from "@/components/bhd/BhdSilentSso";
import { ErrorReporter } from "@/components/error-reporter";
import { LangProvider } from "@/components/lang-provider";
import { IDENTITY_SCRIPT_URL } from "@/lib/bhd/runtime";
import { getI18n } from "@/lib/lang";
import { THEME_COOKIE, normalizeTheme } from "@/lib/utils";
import "./globals.css";

const plexArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-arabic",
  display: "swap",
});

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

/** Runs before paint so the night theme never flashes light; with no saved choice it follows the device. */
const THEME_SCRIPT = `(function(){var d=document.documentElement,q=matchMedia("(prefers-color-scheme: dark)");function saved(){var m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=(light|dark)/);return m&&m[1]}function apply(){d.dataset.theme=saved()||(q.matches?"dark":"light")}apply();q.addEventListener("change",function(){if(!saved())apply()})})()`;

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
  const theme = normalizeTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <html
      lang={lang}
      dir={lang === "en" ? "ltr" : "rtl"}
      data-theme={theme === "system" ? undefined : theme}
      className={`${inter.variable} ${plexArabic.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-dvh antialiased">
        <Script src={IDENTITY_SCRIPT_URL} strategy="afterInteractive" />
        <ErrorReporter />
        <BhdSilentSso />
        <LangProvider lang={lang}>
          <TranslateProvider>{children}</TranslateProvider>
        </LangProvider>
      </body>
    </html>
  );
}
