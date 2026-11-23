import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LabLink - Every lab, within reach",
  description:
    "Campus-scoped laboratory resource sharing: discover equipment, book slots, request access, and resolve conflicts fairly.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
