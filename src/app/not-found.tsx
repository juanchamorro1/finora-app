import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-start justify-center gap-3 px-4">
      <p className="text-sm text-muted-foreground">404</p>
      <h1 className="text-2xl font-semibold tracking-tight">Esta página no existe</h1>
      <Link href="/" className="text-sm underline underline-offset-4">Volver al inicio</Link>
    </main>
  );
}
