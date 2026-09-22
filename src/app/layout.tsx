import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import "./globals.css";
import StandaloneHomeLaunchRedirect from "@/components/StandaloneHomeLaunchRedirect";
import AiConsentPrompt from "@/features/privacy/AiConsentPrompt";
import KeyboardDoneHint from "@/components/KeyboardDoneHint";

export const metadata: Metadata = {
  title: "Cluster",
  description: "Personal wine log with photos",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
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
        <KeyboardDoneHint />
        <Suspense><AiConsentPrompt /></Suspense>
        {children}
      </body>
    </html>
  );
}
