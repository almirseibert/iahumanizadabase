import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "IA Humanizada — Painel",
  description: "Plataforma de atendimento WhatsApp com IA humanizada",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
