import type { Metadata } from "next";
import type { CSSProperties } from "react";

import { ThemeProvider } from "@/components/providers/theme-provider";
import { ToastProvider } from "@/components/providers/toast-provider";

import "./globals.css";

export const metadata: Metadata = {
  title: "MediVanta",
  description: "Smarter Hospitals. Seamless Care.",
};

const themeInitScript = `try{var theme=localStorage.getItem('medivanta-theme');var nextTheme=theme==='dark'?'dark':'light';document.documentElement.classList.toggle('dark',nextTheme==='dark');document.documentElement.dataset.theme=nextTheme;}catch(e){document.documentElement.classList.remove('dark');document.documentElement.dataset.theme='light';}`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{ __html: themeInitScript }}
          suppressHydrationWarning
        />
      </head>
      <body
        style={
          {
            "--font-sans": '"Aptos", "Segoe UI", "Trebuchet MS", sans-serif',
            "--font-serif": '"Georgia", "Cambria", "Times New Roman", serif',
          } as CSSProperties
        }
      >
        <ThemeProvider>
          <ToastProvider>{children}</ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
