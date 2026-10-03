import type { CategoryKind } from "@/generated/prisma/enums";

export interface DefaultCategory {
  name: string;
  kind: CategoryKind;
  icon: string;
  color: string;
}

/** Nombre de la categoría usada para detectar gastos hormiga de forma explícita. */
export const ANT_CATEGORY_NAME = "Gastos hormiga";

export const DEFAULT_EXPENSE_CATEGORIES: DefaultCategory[] = [
  { name: "Comida", kind: "EXPENSE", icon: "utensils", color: "#e8590c" },
  { name: "Transporte", kind: "EXPENSE", icon: "bus", color: "#1c7ed6" },
  { name: "Entretenimiento", kind: "EXPENSE", icon: "clapperboard", color: "#ae3ec9" },
  { name: "Tecnología", kind: "EXPENSE", icon: "laptop", color: "#495057" },
  { name: "Ropa", kind: "EXPENSE", icon: "shirt", color: "#d6336c" },
  { name: "Educación", kind: "EXPENSE", icon: "graduation-cap", color: "#0c8599" },
  { name: "Salud", kind: "EXPENSE", icon: "heart-pulse", color: "#e03131" },
  { name: "Suscripciones", kind: "EXPENSE", icon: "repeat", color: "#7048e8" },
  { name: "Compras", kind: "EXPENSE", icon: "shopping-bag", color: "#f08c00" },
  { name: ANT_CATEGORY_NAME, kind: "EXPENSE", icon: "coffee", color: "#a0522d" },
  { name: "Otros", kind: "EXPENSE", icon: "circle-ellipsis", color: "#868e96" },
];

export const DEFAULT_INCOME_CATEGORIES: DefaultCategory[] = [
  { name: "Dinero familiar", kind: "INCOME", icon: "users", color: "#2b8a3e" },
  { name: "Subsidio", kind: "INCOME", icon: "landmark", color: "#5c940d" },
  { name: "Trabajo", kind: "INCOME", icon: "briefcase", color: "#087f5b" },
  { name: "Freelance", kind: "INCOME", icon: "code", color: "#0b7285" },
  { name: "Venta", kind: "INCOME", icon: "tag", color: "#2f9e44" },
  { name: "Regalo", kind: "INCOME", icon: "gift", color: "#37b24d" },
  { name: "Otros", kind: "INCOME", icon: "circle-ellipsis", color: "#868e96" },
];

export const DEFAULT_CATEGORIES = [...DEFAULT_EXPENSE_CATEGORIES, ...DEFAULT_INCOME_CATEGORIES];

/** Umbral por defecto para "gasto pequeño" (COP). */
export const DEFAULT_ANT_THRESHOLD = 10_000n;

/** Categorías que crea el sistema (identificadas por `systemKey`, no por nombre). */
export const SYSTEM_CATEGORIES = {
  /** Gasto: dinero que sale de una cuenta hacia una meta de ahorro. */
  "goal-saving": { name: "Ahorro para metas", kind: "EXPENSE", icon: "piggy-bank", color: "#0ca678" },
  /** Ingreso: dinero que vuelve de una meta a una cuenta. */
  "goal-withdrawal": { name: "Retiro de metas", kind: "INCOME", icon: "piggy-bank", color: "#0ca678" },
} as const satisfies Record<string, Omit<DefaultCategory, "kind"> & { kind: CategoryKind }>;

export type SystemCategoryKey = keyof typeof SYSTEM_CATEGORIES;
