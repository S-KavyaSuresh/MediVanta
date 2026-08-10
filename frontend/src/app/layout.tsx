import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Script from "next/script";

import { ThemeProvider } from "@/components/providers/theme-provider";
import { ToastProvider } from "@/components/providers/toast-provider";

import "./globals.css";

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
      <body
        style={
          {
            "--font-sans": '"Aptos", "Segoe UI", "Trebuchet MS", sans-serif',
            "--font-serif": '"Georgia", "Cambria", "Times New Roman", serif',
          } as CSSProperties
        }
      >
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
