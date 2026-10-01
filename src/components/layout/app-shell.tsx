"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { LogOut, Menu, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useTransactionDialog } from "@/components/transactions/transaction-dialog-provider";
import { cn } from "@/lib/utils";
import { logoutAction } from "@/server/actions/auth";
import { NAV_ITEMS, isActive } from "./nav-items";

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2 px-2 text-[15px] font-semibold tracking-tight">
      <span className="flex size-7 items-center justify-center rounded-lg bg-foreground text-sm font-bold text-background">
        F
      </span>
      Finora
    </Link>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-0.5" aria-label="Principal">
      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
              active && "bg-muted font-medium text-foreground",
            )}
          >
            <item.icon className="size-4" aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Nombre del usuario y botón para cerrar sesión (solo si hay inicio de sesión activo). */
function UserBox({ name, canLogout }: { name: string; canLogout: boolean }) {
  return (
    <div className="mt-auto flex items-center gap-2 border-t border-border/60 px-1 pt-4">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium">
        {name.trim().charAt(0).toUpperCase()}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm">{name}</span>
      {canLogout && (
        <form action={logoutAction}>
          <Button type="submit" variant="ghost" size="icon-sm" aria-label="Cerrar sesión" title="Cerrar sesión">
            <LogOut />
          </Button>
        </form>
      )}
    </div>
  );
}

export function AppShell({
  children,
  userName,
  canLogout,
}: {
  children: ReactNode;
  userName: string;
  canLogout: boolean;
}) {
  const { openCreate } = useTransactionDialog();
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const mobileItems = NAV_ITEMS.filter((i) => i.mobile);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[15rem_1fr]">
      {/* Barra lateral (escritorio) */}
      <aside className="sticky top-0 hidden h-dvh flex-col gap-6 border-r border-border/60 px-3 py-5 lg:flex">
        <Brand />
        <Button onClick={() => openCreate()} className="h-9 justify-start gap-2">
          <Plus /> Añadir movimiento
        </Button>
        <NavLinks />
        <UserBox name={userName} canLogout={canLogout} />
      </aside>

      {/* Encabezado (móvil) */}
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border/60 bg-background/90 px-4 backdrop-blur lg:hidden">
        <Brand />
        <Button variant="ghost" size="icon" aria-label="Abrir menú" onClick={() => setMoreOpen(true)}>
          <Menu />
        </Button>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 pt-6 pb-28 sm:px-6 lg:px-10 lg:pt-10 lg:pb-16">{children}</main>

      {/* Barra inferior (móvil) */}
      <nav
        aria-label="Navegación rápida"
        className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 items-center border-t border-border/60 bg-background/95 px-2 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] backdrop-blur lg:hidden"
      >
        {mobileItems.slice(0, 2).map((item) => (
          <MobileTab key={item.href} href={item.href} label={item.label} icon={item.icon} active={isActive(pathname, item.href)} />
        ))}
        <div className="flex justify-center">
          <Button
            onClick={() => openCreate()}
            aria-label="Añadir movimiento"
            className="size-12 rounded-full shadow-md [&_svg:not([class*='size-'])]:size-5"
          >
            <Plus />
          </Button>
        </div>
        {mobileItems.slice(2, 3).map((item) => (
          <MobileTab key={item.href} href={item.href} label={item.label} icon={item.icon} active={isActive(pathname, item.href)} />
        ))}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className="flex flex-col items-center gap-0.5 py-1 text-[11px] text-muted-foreground"
        >
          <Menu className="size-5" aria-hidden />
          Más
        </button>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="left" className="flex w-72 flex-col p-4">
          <SheetHeader className="p-0 pb-4">
            <SheetTitle className="sr-only">Menú</SheetTitle>
            <Brand />
          </SheetHeader>
          <NavLinks onNavigate={() => setMoreOpen(false)} />
          <UserBox name={userName} canLogout={canLogout} />
        </SheetContent>
      </Sheet>
    </div>
  );
}

function MobileTab({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: (typeof NAV_ITEMS)[number]["icon"];
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex flex-col items-center gap-0.5 py-1 text-[11px] text-muted-foreground",
        active && "font-medium text-foreground",
      )}
    >
      <Icon className="size-5" aria-hidden />
      {label}
    </Link>
  );
}
