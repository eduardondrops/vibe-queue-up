import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth-context";
import { Toaster } from "@/components/ui/sonner";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-display font-bold grad-text">404</h1>
        <h2 className="mt-4 text-xl font-semibold">Página não encontrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          A página que você procura não existe.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md grad-bg px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Ir para o início
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content:
          "width=device-width, initial-scale=1, viewport-fit=cover",
      },
      { name: "theme-color", content: "#0d0014" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "PostFlow" },
      { name: "mobile-web-app-capable", content: "yes" },
      { title: "ReelQueue — Agendamento inteligente de Reels" },
      {
        name: "description",
        content:
          "Sistema simples e poderoso para organizar, agendar e postar Reels com fila automática.",
      },
      { property: "og:title", content: "ReelQueue — Agendamento inteligente de Reels" },
      {
        property: "og:description",
        content: "Organize seus vídeos verticais com uma fila inteligente.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:title", content: "ReelQueue — Agendamento inteligente de Reels" },
      { name: "description", content: "Organize suas postagens no Instagram, TikTok, Facebook e Youtube com estratégia!" },
      { property: "og:description", content: "Organize suas postagens no Instagram, TikTok, Facebook e Youtube com estratégia!" },
      { name: "twitter:description", content: "Organize suas postagens no Instagram, TikTok, Facebook e Youtube com estratégia!" },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/Hey3qMpAftSqDQK5eenh7oXf5K12/social-images/social-1776463950372-a-premium-3d-app-icon-featuring-an-elega_NHi1nh04Rem75BGvmEZLMQ_h47Px3-uSFaN6h75L_TNQg_sd.webp" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/Hey3qMpAftSqDQK5eenh7oXf5K12/social-images/social-1776463950372-a-premium-3d-app-icon-featuring-an-elega_NHi1nh04Rem75BGvmEZLMQ_h47Px3-uSFaN6h75L_TNQg_sd.webp" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "icon", href: "/icon-512.png", type: "image/png" },
      { rel: "apple-touch-icon", href: "/icon-512.png" },
      {
        rel: "preconnect",
        href: "https://fonts.googleapis.com",
      },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Space+Grotesk:wght@500;600;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  return (
    <AuthProvider>
      <Outlet />
      <Toaster />
    </AuthProvider>
  );
}
