"use client";

import { useState, useTransition } from "react";
import { MoreHorizontal, Plus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CATEGORY_ICONS, CategoryIcon } from "@/components/shared/category-icon";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import type { FieldErrors } from "@/lib/action-result";
import { cn } from "@/lib/utils";
import {
  createCategoryAction,
  deleteCategoryAction,
  setCategoryArchivedAction,
  updateCategoryAction,
} from "@/server/actions/categories";

type Kind = "EXPENSE" | "INCOME";

export interface ManagedCategory {
  id: string;
  name: string;
  kind: Kind;
  icon: string;
  color: string;
  isArchived: boolean;
  transactionCount: number;
  hasBudget: boolean;
}

const COLORS = ["#e8590c", "#1c7ed6", "#ae3ec9", "#495057", "#d6336c", "#0c8599", "#e03131", "#7048e8", "#f08c00", "#a0522d", "#2b8a3e", "#5c940d"];

export function CategoryManager({ categories }: { categories: ManagedCategory[] }) {
  const [kind, setKind] = useState<Kind>("EXPENSE");
  const [editing, setEditing] = useState<ManagedCategory | "new" | null>(null);
  const list = categories.filter((c) => c.kind === kind);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1" role="tablist">
          {(["EXPENSE", "INCOME"] as const).map((k) => (
            <button
              key={k}
              role="tab"
              aria-selected={kind === k}
              onClick={() => setKind(k)}
              className={cn("rounded-md px-3 py-1 text-sm text-muted-foreground", kind === k && "bg-background text-foreground shadow-sm")}
            >
              {k === "EXPENSE" ? "Gastos" : "Ingresos"}
            </button>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={() => setEditing("new")}>
          <Plus /> Nueva categoría
        </Button>
      </div>
      <ul className="divide-y divide-border/60">
        {list.map((c) => (
          <CategoryRow key={c.id} category={c} onEdit={() => setEditing(c)} />
        ))}
      </ul>
      {editing && (
        <CategoryDialog
          key={editing === "new" ? `new-${kind}` : editing.id}
          kind={kind}
          category={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function CategoryRow({ category, onEdit }: { category: ManagedCategory; onEdit: () => void }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [, startTransition] = useTransition();

  function toggleArchive() {
    startTransition(async () => {
      const result = await setCategoryArchivedAction(category.id, !category.isArchived);
      if (!result.ok) toast.error(result.error);
      else toast.success(category.isArchived ? "Categoría restaurada" : "Categoría archivada");
    });
  }

  async function remove() {
    const result = await deleteCategoryAction(category.id);
    if (!result.ok) {
      toast.error(result.error);
      return false;
    }
    toast.success("Categoría eliminada");
  }

  return (
    <li className={cn("flex items-center gap-3 py-3", category.isArchived && "opacity-55")}>
      <CategoryIcon icon={category.icon} color={category.color} size="sm" />
      <span className="flex-1 text-sm">
        {category.name}
        {category.isArchived && <Badge variant="secondary" className="ml-2">Archivada</Badge>}
      </span>
      <span className="tabular text-xs text-muted-foreground">
        {category.transactionCount} {category.transactionCount === 1 ? "movimiento" : "movimientos"}
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Opciones de ${category.name}`} />}>
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onEdit}>Editar</DropdownMenuItem>
          <DropdownMenuItem onClick={toggleArchive}>{category.isArchived ? "Restaurar" : "Archivar"}</DropdownMenuItem>
          {category.transactionCount === 0 && (
            <DropdownMenuItem variant="destructive" onClick={() => setConfirmDelete(true)}>Eliminar</DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`¿Eliminar "${category.name}"?`}
        description={category.hasBudget ? "No tiene movimientos. También se eliminará su presupuesto." : "No tiene movimientos y se eliminará por completo."}
        confirmLabel="Eliminar"
        onConfirm={remove}
      />
    </li>
  );
}

function CategoryDialog({ kind, category, onClose }: { kind: Kind; category: ManagedCategory | null; onClose: () => void }) {
  const [name, setName] = useState(category?.name ?? "");
  const [icon, setIcon] = useState(category?.icon ?? "circle");
  const [color, setColor] = useState(category?.color ?? COLORS[0]);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = category
        ? await updateCategoryAction(category.id, { name, icon, color })
        : await createCategoryAction({ name, kind, icon, color });
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        if (!result.fieldErrors) toast.error(result.error);
        return;
      }
      toast.success(category ? "Categoría actualizada" : "Categoría creada");
      onClose();
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{category ? "Editar categoría" : `Nueva categoría de ${kind === "EXPENSE" ? "gasto" : "ingreso"}`}</DialogTitle>
          <DialogDescription className="sr-only">Nombre, icono y color.</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="flex items-end gap-3">
            <CategoryIcon icon={icon} color={color} />
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="category-name">Nombre</Label>
              <Input id="category-name" maxLength={30} value={name} onChange={(e) => setName(e.target.value)} aria-invalid={Boolean(errors.name) || undefined} autoFocus />
            </div>
          </div>
          {errors.name && <p className="-mt-3 text-sm text-destructive">{errors.name}</p>}
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Icono</legend>
            <div className="grid grid-cols-9 gap-1.5">
              {Object.entries(CATEGORY_ICONS).map(([key, Icon]) => (
                <button
                  key={key}
                  type="button"
                  aria-label={key}
                  aria-pressed={icon === key}
                  onClick={() => setIcon(key)}
                  className={cn("flex aspect-square items-center justify-center rounded-md text-muted-foreground hover:bg-muted", icon === key && "bg-foreground text-background hover:bg-foreground")}
                >
                  <Icon className="size-4" />
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Color</legend>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Color ${c}`}
                  aria-pressed={color === c}
                  onClick={() => setColor(c)}
                  className={cn("size-7 rounded-full ring-offset-2 ring-offset-background", color === c && "ring-2 ring-foreground")}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </fieldset>
          <DialogFooter>
            <Button type="submit" disabled={pending}>{pending ? "Guardando…" : "Guardar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
