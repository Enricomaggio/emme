import { useState, useMemo, useCallback, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  LayoutDashboard,
  Users,
  Target,
  Settings,
  Menu,
  X,
  LogOut,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { APP_CONFIG } from "@/lib/config";
import { useIdleTimeout } from "@/hooks/use-idle-timeout";

interface DashboardLayoutProps {
  children: React.ReactNode;
  user?: {
    id?: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    profileImageUrl?: string | null;
  };
  fullWidth?: boolean;
}

const navigationItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/clienti", label: "Clienti", icon: Users },
  { href: "/pipeline", label: "Pipeline", icon: Target },
  { href: "/impostazioni", label: "Impostazioni", icon: Settings },
];

function ReminderBadge() {
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);
  const { data: reminders } = useQuery<any[]>({
    queryKey: [`/api/reminders?completed=false&dueBefore=${todayEnd.toISOString()}`],
    refetchInterval: 30000,
  });
  const count = reminders?.length || 0;
  if (!count) return null;
  return (
    <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 text-[11px] font-bold text-white px-1 shadow-[0_0_10px_rgba(239,68,68,0.5)]">
      {count > 99 ? "99+" : count}
    </span>
  );
}

const SIDEBAR_COLLAPSED_KEY = "sidebar-collapsed";
const LG_BREAKPOINT = 1024;

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== "undefined" && window.innerWidth >= LG_BREAKPOINT,
  );
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${LG_BREAKPOINT}px)`);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isDesktop;
}

export function DashboardLayout({ children, user, fullWidth = false }: DashboardLayoutProps) {
  const [location] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true";
    } catch {
      return false;
    }
  });
  const isDesktop = useIsDesktop();
  const isDesktopCollapsed = isDesktop && collapsed;

  const { logout } = useAuth();

  const userInitials = useMemo(() => {
    if (user?.firstName && user?.lastName)
      return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
    return user?.email?.[0]?.toUpperCase() || "U";
  }, [user?.firstName, user?.lastName, user?.email]);

  const userName = user?.firstName && user?.lastName
    ? `${user.firstName} ${user.lastName}`
    : user?.email || "Utente";

  const handleLogout = useCallback(() => {
    logout();
    window.location.href = "/login";
  }, [logout]);

  useIdleTimeout(handleLogout);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next)); } catch {}
      return next;
    });
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="min-h-screen bg-background">
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <aside
          className={cn(
            "fixed top-0 left-0 z-50 h-full w-64 bg-gradient-to-b from-[#020617] to-[#0a1628] border-r border-white/[0.06] transition-all duration-300 lg:translate-x-0",
            sidebarOpen ? "translate-x-0" : "-translate-x-full",
            collapsed ? "lg:w-16" : "lg:w-64",
          )}
        >
          <div className="flex flex-col h-full">
            <div className={cn(
              "flex items-center border-b border-white/[0.06]",
              isDesktopCollapsed ? "justify-center p-3" : "justify-between p-4",
            )}>
              <div className="flex items-center gap-2">
                <img
                  src="/emme-logo.png"
                  alt={APP_CONFIG.appName}
                  className={cn(
                    "text-glow-blue",
                    isDesktopCollapsed ? "h-10 w-10 object-contain" : "h-10 w-auto object-contain",
                  )}
                  onError={(e) => {
                    // Fallback testuale finché non c'è il file logo
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden text-sidebar-foreground hover:bg-white/[0.04]"
                onClick={() => setSidebarOpen(false)}
              >
                <X className="w-5 h-5" />
              </Button>
            </div>

            <nav className={cn("flex-1 space-y-1", isDesktopCollapsed ? "p-2" : "p-4")}>
              {navigationItems.map((item) => {
                const isActive =
                  location === item.href ||
                  (item.href !== "/dashboard" && location.startsWith(item.href));

                const navContent = (
                  <div
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-all duration-150 cursor-pointer",
                      isDesktopCollapsed && "justify-center px-2",
                      isActive
                        ? "bg-blue-500/10 border-l-2 border-blue-500 text-white shadow-[0_0_12px_rgba(59,130,246,0.08)]"
                        : "text-slate-400 hover:bg-white/[0.04] hover:text-white",
                    )}
                  >
                    <item.icon className={cn("w-5 h-5 shrink-0", isActive && "text-blue-400")} />
                    {!isDesktopCollapsed && <span className="tracking-wide">{item.label}</span>}
                    {!isDesktopCollapsed && item.href === "/dashboard" && <ReminderBadge />}
                  </div>
                );

                if (isDesktopCollapsed) {
                  return (
                    <Tooltip key={item.href}>
                      <TooltipTrigger asChild>
                        <Link href={item.href}>{navContent}</Link>
                      </TooltipTrigger>
                      <TooltipContent side="right">{item.label}</TooltipContent>
                    </Tooltip>
                  );
                }

                return (
                  <Link key={item.href} href={item.href}>
                    {navContent}
                  </Link>
                );
              })}
            </nav>

            <div className={cn("border-t border-white/[0.06]", isDesktopCollapsed ? "p-2" : "p-4")}>
              {isDesktopCollapsed ? (
                <div className="flex flex-col items-center gap-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center justify-center w-full p-2 rounded-md cursor-default">
                        <Avatar className="w-8 h-8">
                          <AvatarImage src={user?.profileImageUrl || undefined} alt={userName} />
                          <AvatarFallback className="text-xs bg-blue-600 text-white">
                            {userInitials}
                          </AvatarFallback>
                        </Avatar>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="right">{userName}</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        className="flex items-center justify-center w-full p-2 rounded-md hover:bg-white/[0.04] transition-all duration-150 text-slate-400 hover:text-white"
                        onClick={handleLogout}
                      >
                        <LogOut className="w-5 h-5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right">Esci</TooltipContent>
                  </Tooltip>
                </div>
              ) : (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex items-center gap-3 w-full p-2 rounded-md hover:bg-white/[0.04] transition-all duration-150">
                      <Avatar className="w-8 h-8">
                        <AvatarImage src={user?.profileImageUrl || undefined} alt={userName} />
                        <AvatarFallback className="text-xs bg-blue-600 text-white">
                          {userInitials}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col items-start text-left flex-1 min-w-0">
                        <span className="text-sm font-medium text-white truncate w-full">{userName}</span>
                        <span className="text-xs text-slate-500 truncate w-full">Admin</span>
                      </div>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem asChild>
                      <Link href="/impostazioni">
                        <Settings className="w-4 h-4 mr-2" />
                        Impostazioni
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleLogout} className="text-destructive cursor-pointer">
                      <LogOut className="w-4 h-4 mr-2" />
                      Esci
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>

          <button
            className="hidden lg:flex absolute top-1/2 -right-3 -translate-y-1/2 z-10 items-center justify-center w-6 h-6 rounded-full bg-slate-900 border border-white/[0.08] text-slate-400 hover:text-white shadow-[0_0_10px_rgba(59,130,246,0.15)] transition-all duration-150"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Espandi sidebar" : "Comprimi sidebar"}
          >
            {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
          </button>
        </aside>

        <div className={cn("transition-all duration-300", collapsed ? "lg:pl-16" : "lg:pl-64")}>
          <header className="sticky top-0 z-30 flex items-center h-12 px-4 border-b border-white/[0.06] bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60 lg:hidden">
            <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)}>
              <Menu className="w-5 h-5" />
            </Button>
            <div className="flex-1" />
            <Avatar className="w-8 h-8">
              <AvatarImage src={user?.profileImageUrl || undefined} alt={userName} />
              <AvatarFallback className="text-xs bg-blue-600 text-white">{userInitials}</AvatarFallback>
            </Avatar>
          </header>

          <main className="p-4 sm:p-6 lg:p-8">
            <div className={cn("mx-auto", fullWidth ? "w-full" : "max-w-7xl")}>
              <AnimatePresence mode="wait">
                <motion.div
                  key={location}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                >
                  {children}
                </motion.div>
              </AnimatePresence>
            </div>
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
