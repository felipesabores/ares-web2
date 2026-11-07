import type { Metadata } from "next";
import { sessionSecret } from "@/lib/env";
import { Lexend, Poppins } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AppShell } from "@/components/AppShell";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";

const lexend = Lexend({ subsets: ["latin"], variable: "--font-sans" });
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: "ARES | Acerta Express — Performance Diária",
  description: "Dashboard operacional em tempo real",
};


async function getSessionUser() {
  try {
    const token = (await cookies()).get("ares_session")?.value;
    if (!token) return null;
    const { payload } = await jwtVerify(token, sessionSecret());
    return { role: (payload.role as string) ?? "", name: (payload.name as string) ?? "—" };
  } catch {
    return null;
  }
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getSessionUser();

  return (
    <html lang="pt-BR" className={`${lexend.variable} ${poppins.variable}`} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('ares-theme')||'dark';if(t!=='light')document.documentElement.classList.add('dark');}catch(e){document.documentElement.classList.add('dark');}})();`,
          }}
        />
      </head>
      <body className="antialiased">
        <ThemeProvider>
          <AppShell initialRole={user?.role ?? ""} initialName={user?.name ?? "—"}>
            {children}
          </AppShell>
        </ThemeProvider>
      </body>
    </html>
  );
}
