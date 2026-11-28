import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import { branding } from "@/config/branding";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: branding.productName, template: `%s | ${branding.productName}` },
  applicationName: branding.productName,
  description: branding.description,
  creator: branding.copyrightHolder,
  icons: {
    icon: branding.favicon,
    ...(branding.appleIcon && { apple: branding.appleIcon }),
  },
  openGraph: { title: branding.productName, description: branding.description, siteName: branding.productName, type: "website" },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(() => {
              try {
                const nextKey = 'encifone-theme';
                const legacyKey = 'theme';
                const current = localStorage.getItem(nextKey);
                if (!current) {
                  const legacy = localStorage.getItem(legacyKey);
                  if (legacy === 'dark') localStorage.setItem(nextKey, 'professional-dark');
                  else if (legacy === 'light') localStorage.setItem(nextKey, 'professional-light');
                  else if (legacy === 'aurora' || legacy === 'professional-dark' || legacy === 'professional-light') {
                    localStorage.setItem(nextKey, legacy);
                  }
                }
              } catch {}
            })();`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
