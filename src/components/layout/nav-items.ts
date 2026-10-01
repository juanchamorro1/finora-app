import {
  ArrowLeftRight,
  ChartPie,
  Coffee,
  Goal,
  LayoutDashboard,
  PiggyBank,
  Settings,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Visible en la barra inferior del móvil. */
  mobile?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Inicio", icon: LayoutDashboard, mobile: true },
  { href: "/movimientos", label: "Movimientos", icon: ArrowLeftRight, mobile: true },
  { href: "/cuentas", label: "Cuentas", icon: Wallet },
  { href: "/presupuestos", label: "Presupuestos", icon: PiggyBank, mobile: true },
  { href: "/metas", label: "Metas", icon: Goal },
  { href: "/estadisticas", label: "Estadísticas", icon: ChartPie },
  { href: "/gastos-hormiga", label: "Gastos hormiga", icon: Coffee },
  { href: "/ajustes", label: "Ajustes", icon: Settings },
];

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
