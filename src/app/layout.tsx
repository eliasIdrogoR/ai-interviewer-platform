import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Interviewer Platform",
  description: "Voice-first AI interview practice for role-grounded sample jobs.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
