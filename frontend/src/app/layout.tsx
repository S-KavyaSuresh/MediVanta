import type { Metadata } from "next";
import { Manrope, Source_Serif_4 } from "next/font/google";
import Script from "next/script";

import { ThemeProvider } from "@/components/providers/theme-provider";
import { ToastProvider } from "@/components/providers/toast-provider";

import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-sans",
});

const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-serif",
});

export const metadata: Metadata = {
  title: "MediVanta",
  description: "Smarter Hospitals. Seamless Care.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${manrope.variable} ${sourceSerif.variable}`}>
        <Script id="medivanta-theme-init" strategy="beforeInteractive">
          {`try{var theme=localStorage.getItem('medivanta-theme');var nextTheme=theme==='dark'?'dark':'light';document.documentElement.classList.toggle('dark',nextTheme==='dark');document.documentElement.dataset.theme=nextTheme;}catch(e){document.documentElement.classList.remove('dark');document.documentElement.dataset.theme='light';}`}
        </Script>
        <ThemeProvider>
          <ToastProvider>{children}</ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
