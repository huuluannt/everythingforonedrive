import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { PwaRegister } from "@/components/pwa-register";
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
  title: "Everything for OneDrive",
  description: "Fast selected-folder OneDrive name search for Android.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/brand/logo-evrtfod.png",
    apple: "/brand/logo-evrtfod.png",
  },
  appleWebApp: {
    capable: true,
    title: "Everything for OneDrive",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b66d8",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
