import {
  ArrowLeftRight,
  Briefcase,
  Bus,
  Circle,
  CircleEllipsis,
  Clapperboard,
  Code,
  Coffee,
  Gift,
  GraduationCap,
  HeartPulse,
  Landmark,
  Laptop,
  Repeat,
  Scale,
  Shirt,
  ShoppingBag,
  Tag,
  Users,
  Utensils,
  Wallet,
  Home,
  PawPrint,
  Plane,
  Dumbbell,
  Smartphone,
  Car,
  Baby,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/** Iconos disponibles para categorías (nombre guardado en BD → componente). */
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  utensils: Utensils,
  bus: Bus,
  car: Car,
  clapperboard: Clapperboard,
  laptop: Laptop,
  smartphone: Smartphone,
  shirt: Shirt,
  "graduation-cap": GraduationCap,
  "heart-pulse": HeartPulse,
  dumbbell: Dumbbell,
  repeat: Repeat,
  "shopping-bag": ShoppingBag,
  coffee: Coffee,
  home: Home,
  "paw-print": PawPrint,
  plane: Plane,
  baby: Baby,
  users: Users,
  landmark: Landmark,
  briefcase: Briefcase,
  code: Code,
  tag: Tag,
  gift: Gift,
  wallet: Wallet,
  "circle-ellipsis": CircleEllipsis,
  circle: Circle,
};

export function CategoryIcon({
  icon,
  color,
  className,
  size = "md",
}: {
  icon: string;
  color: string;
  className?: string;
  size?: "sm" | "md";
}) {
  const Icon = CATEGORY_ICONS[icon] ?? Circle;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full",
        size === "md" ? "size-9" : "size-7",
        className,
      )}
      style={{ backgroundColor: `color-mix(in oklab, ${color} 14%, transparent)`, color }}
    >
      <Icon className={size === "md" ? "size-4" : "size-3.5"} aria-hidden />
    </span>
  );
}

/** Icono para movimientos sin categoría (transferencias, saldos iniciales, ajustes). */
export function SystemTransactionIcon({ type, size = "md" }: { type: string; size?: "sm" | "md" }) {
  const Icon = type === "TRANSFER" ? ArrowLeftRight : type === "ADJUSTMENT" ? Scale : Wallet;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground",
        size === "md" ? "size-9" : "size-7",
      )}
    >
      <Icon className={size === "md" ? "size-4" : "size-3.5"} aria-hidden />
    </span>
  );
}
