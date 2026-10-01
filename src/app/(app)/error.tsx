"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div role="alert" className="flex flex-col items-start gap-4 py-16">
      <h1 className="text-xl font-semibold tracking-tight">Algo salió mal</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        No pudimos cargar esta sección. Tus datos no se modificaron. Intenta de nuevo; si el problema sigue,
        revisa la consola del servidor.
      </p>
      <Button onClick={reset}>Reintentar</Button>
    </div>
  );
}
