"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTransactionDialog } from "./transaction-dialog-provider";
import type { TransactionFormInitial } from "./transaction-form";

export function AddTransactionButton({
  className,
  label = "Añadir movimiento",
  defaults,
  variant = "default",
}: {
  className?: string;
  label?: string;
  defaults?: Partial<TransactionFormInitial>;
  variant?: "default" | "outline" | "secondary" | "ghost";
}) {
  const { openCreate } = useTransactionDialog();
  return (
    <Button className={className} variant={variant} onClick={() => openCreate(defaults)}>
      <Plus /> {label}
    </Button>
  );
}
