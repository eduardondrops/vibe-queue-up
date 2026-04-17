import { Link, useLocation } from "@tanstack/react-router";
import { Calendar, Upload, LogOut, Sparkles, Settings, Home } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";

export function AppShell({
  children,
  workspaceId,
  workspaceName,
}: {
  children: React.ReactNode;
  workspaceId?: string;
  workspaceName?: string;
}) {
  const { signOut, user } = useAuth();
  const location = useLocation();

  const isActive = (p: string) => location.pathname === p;
  const startsWith = (p: string) => location.pathname.startsWith(p);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-30 glass">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2 min-w-0">
            <div className="grad-bg flex h-8 w-8 items-center justify-center rounded-xl shadow-[var(--shadow-glow)]">
              <Sparkles className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-display text-lg font-semibold tracking-tight truncate">
              {workspaceName ? (
                <span className="truncate">{workspaceName}</span>
              ) : (
                <>
                  Post<span className="grad-text">Flow</span>
                </>
              )}
            </span>
          </Link>
          <div className="flex items-center gap-1">
            {user && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => signOut()}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Sair"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-28 pt-4">
        {children}
      </main>

      {user && workspaceId && (
        <nav className="fixed inset-x-0 bottom-0 z-30 glass">
          <div className="mx-auto flex max-w-3xl items-stretch">
            <Link
              to="/"
              className={`flex flex-1 flex-col items-center gap-1 py-3 text-xs transition-colors ${
                isActive("/")
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Home className="h-5 w-5" />
              Perfis
            </Link>
            <Link
              to="/w/$workspaceId"
              params={{ workspaceId }}
              className={`flex flex-1 flex-col items-center gap-1 py-3 text-xs transition-colors ${
                isActive(`/w/${workspaceId}`)
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Calendar className="h-5 w-5" />
              Agenda
            </Link>
            <Link
              to="/w/$workspaceId/upload"
              params={{ workspaceId }}
              className={`flex flex-1 flex-col items-center gap-1 py-3 text-xs transition-colors ${
                startsWith(`/w/${workspaceId}/upload`)
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Upload className="h-5 w-5" />
              Upload
            </Link>
            <Link
              to="/w/$workspaceId/settings"
              params={{ workspaceId }}
              className={`flex flex-1 flex-col items-center gap-1 py-3 text-xs transition-colors ${
                startsWith(`/w/${workspaceId}/settings`)
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Settings className="h-5 w-5" />
              Ajustes
            </Link>
          </div>
        </nav>
      )}
    </div>
  );
}
