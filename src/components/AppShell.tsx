import { Link, useLocation } from "@tanstack/react-router";
import { Calendar, Upload, LogOut, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { isAdmin, signOut, user } = useAuth();
  const location = useLocation();

  const isActive = (p: string) =>
    location.pathname === p || (p !== "/" && location.pathname.startsWith(p));

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-30 glass">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <div className="grad-bg flex h-8 w-8 items-center justify-center rounded-xl shadow-[var(--shadow-glow)]">
              <Sparkles className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-display text-lg font-semibold tracking-tight">
              Reel<span className="grad-text">Queue</span>
            </span>
          </Link>
          <div className="flex items-center gap-1">
            {user && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => signOut()}
                className="text-muted-foreground hover:text-foreground"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-28 pt-4">{children}</main>

      {user && (
        <nav className="fixed inset-x-0 bottom-0 z-30 glass">
          <div className="mx-auto flex max-w-3xl items-stretch">
            <Link
              to="/"
              className={`flex flex-1 flex-col items-center gap-1 py-3 text-xs transition-colors ${
                isActive("/") && !isActive("/admin")
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Calendar className="h-5 w-5" />
              Calendário
            </Link>
            {isAdmin && (
              <Link
                to="/admin"
                className={`flex flex-1 flex-col items-center gap-1 py-3 text-xs transition-colors ${
                  isActive("/admin")
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Upload className="h-5 w-5" />
                Upload
              </Link>
            )}
          </div>
        </nav>
      )}
    </div>
  );
}
