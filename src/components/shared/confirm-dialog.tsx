"use client";

import { useState, useTransition, type ReactElement } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

/**
 * Diálogo de confirmación para acciones destructivas. `onConfirm` puede ser
 * asíncrono; el diálogo permanece abierto (y deshabilitado) mientras corre.
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel = "Confirmar",
  destructive = true,
  onConfirm,
  open: controlledOpen,
  onOpenChange,
}: {
  trigger?: ReactElement;
  title: string;
  description: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => Promise<boolean | void> | boolean | void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const [pending, startTransition] = useTransition();

  return (
    <AlertDialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
      {trigger && <AlertDialogTrigger render={trigger} />}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            variant={destructive ? "destructive" : "default"}
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await onConfirm();
                if (result !== false) setOpen(false);
              })
            }
          >
            {pending ? "Procesando…" : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
