import type { Metadata } from "next";
import { Archivo, Source_Serif_4 } from "next/font/google";
import "./globals.css";

// Both are variable fonts, so no weight list is needed — the whole range
// (Archivo 400/600/800, Source Serif 400/600) comes down in one file.
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
});

const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Condorcet",
  description:
    "See how the candidates in your race actually voted on the issues you care about.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${archivo.variable} ${sourceSerif.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
