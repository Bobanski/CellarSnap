import type { Metadata } from "next";
import "./globals.css";
import StandaloneHomeLaunchRedirect from "@/components/StandaloneHomeLaunchRedirect";

export const metadata: Metadata = {
  title: "CellarSnap",
  description: "Personal wine log with photos",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <StandaloneHomeLaunchRedirect />
        {children}
      </body>
    </html>
  );
}
