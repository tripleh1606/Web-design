import { Kodchasan } from "next/font/google";
import type { Metadata, Viewport } from "next";
import "./globals.css";


const kodchasan = Kodchasan({
  subsets: ['vietnamese', 'latin'],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: "Soucha - Trà Matcha & Houjicha",
  description: "Menu đặt món Soucha Matcha & Houjicha",
  icons: {
    icon: "/logo.svg",
    shortcut: "/logo.svg",
    apple: "/logo.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body className={`${kodchasan.className} min-h-screen bg-[#fdfcfc] text-[#43281a] antialiased selection:bg-[#155727] selection:text-[#fdfcfc]`}>
        {children}
      </body>
    </html>
  );
}
