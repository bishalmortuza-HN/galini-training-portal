import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Galini Training Portal",
  description: "One workspace for agency training, membership, and progress."
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}