import type { Metadata } from "next";
import { IM_Fell_English_SC, Atkinson_Hyperlegible } from "next/font/google";
import { SkipLink } from "@/components/skip-link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import "./globals.css";

const imFell = IM_Fell_English_SC({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-im-fell",
});

const atkinson = Atkinson_Hyperlegible({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-atkinson",
});

export const metadata: Metadata = {
  title: "Gravekeeper",
  description:
    "Paste a public GitHub repository and see which of its dependencies are dead, haunted or alive, drawn as a graveyard.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${imFell.variable} ${atkinson.variable}`}>
      <body className="bg-night text-bone font-sans min-h-full flex flex-col">
        <SkipLink />
        <SiteHeader />
        <main id="main" className="flex-1">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
