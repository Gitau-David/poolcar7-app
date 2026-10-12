import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pool Car Dispatch",
  description: "Requisition and allocation system for pool vehicles.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
