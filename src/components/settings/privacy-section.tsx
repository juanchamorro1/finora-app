"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Download, LogOut, MonitorSmartphone, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteAccountAction, logoutAction, revokeAllSessionsAction } from "@/server/actions/auth";

export function PrivacySection({
  username,
  acceptedAt,
  canLogout,
}: {
  username: string;
  acceptedAt: string | null;
  canLogout: boolean;
}) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function deleteAccount() {
    startTransition(async () => {
      const result = await deleteAccountAction(confirm);
      // Si tuvo éxito, la acción redirige y no llega aquí.
      if (result && !result.ok) setError(result.fieldErrors?.confirm ?? result.error);
    });
  }

  function revokeAll() {
    startTransition(async () => {
      const result = await revokeAllSessionsAction();
      if (result && !result.ok) toast.error(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        {acceptedAt ? `Aceptaste la política de tratamiento de datos el ${acceptedAt}. ` : ""}
        <Link href="/politica-de-datos" className="text-foreground underline underline-offset-4">
          Ver la política
        </Link>
      </p>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button variant="outline" render={<a href="/api/mis-datos" download />} nativeButton={false}>
          <Download /> Descargar mis datos
        </Button>
        {canLogout && (
          <>
            <form action={logoutAction}>
              <Button type="submit" variant="outline" className="w-full sm:w-auto">
                <LogOut /> Cerrar sesión
              </Button>
            </form>
            <Button variant="outline" onClick={revokeAll} disabled={pending}>
              <MonitorSmartphone /> Cerrar sesión en todos los dispositivos
            </Button>
          </>
        )}
      </div>

      <div className="rounded-xl border border-destructive/30 p-4">
        <h3 className="text-sm font-medium">Eliminar mi cuenta</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Borra tu usuario y <strong>todos</strong> tus datos (cuentas, movimientos, metas, presupuestos y ajustes) de forma
          definitiva. Te recomendamos descargar tus datos antes.
        </p>
        <Button variant="destructive" className="mt-3" onClick={() => setDeleteOpen(true)}>
          <Trash2 /> Eliminar mi cuenta
        </Button>
      </div>

      <Dialog
        open={deleteOpen}
        onOpenChange={(o) => {
          if (pending) return;
          setDeleteOpen(o);
          setConfirm("");
          setError(undefined);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>¿Eliminar tu cuenta para siempre?</DialogTitle>
            <DialogDescription>
              Se borrarán todos tus datos y no se podrán recuperar. Para confirmar, escribe tu usuario:{" "}
              <strong className="text-foreground">{username}</strong>
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              deleteAccount();
            }}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="confirm-username">Tu usuario</Label>
              <Input
                id="confirm-username"
                autoComplete="off"
                autoCapitalize="none"
                value={confirm}
                onChange={(e) => {
                  setConfirm(e.target.value);
                  setError(undefined);
                }}
                aria-invalid={Boolean(error) || undefined}
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
            <DialogFooter>
              <Button
                type="submit"
                variant="destructive"
                disabled={pending || confirm.trim().toLowerCase() !== username}
              >
                {pending ? "Eliminando…" : "Eliminar definitivamente"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
