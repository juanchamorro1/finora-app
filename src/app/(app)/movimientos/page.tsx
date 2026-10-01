import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeftRight, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { PageHeader } from "@/components/shared/page-header";
import { AddTransactionButton } from "@/components/transactions/add-transaction-button";
import { TransactionFilters } from "@/components/transactions/transaction-filters";
import { TransactionList } from "@/components/transactions/transaction-list";
import { cn } from "@/lib/utils";
import { db } from "@/server/db";
import { parseTransactionFilters } from "@/server/filters";
import { toTransactionRow } from "@/server/mappers";
import { searchTransactions } from "@/server/services/transactions";

export const metadata: Metadata = { title: "Movimientos" };

const PAGE_SIZE = 50;

export default async function MovementsPage({ searchParams }: PageProps<"/movimientos">) {
  const params = await searchParams;
  const { page, ...filters } = parseTransactionFilters(params);
  const { items, total } = await searchTransactions(db, filters, { take: PAGE_SIZE, skip: (page - 1) * PAGE_SIZE });
  const rows = items.map(toTransactionRow);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasQuery = Boolean(filters.q || filters.type || filters.categoryId || filters.accountId || filters.from || filters.to || filters.minAmount !== undefined || filters.maxAmount !== undefined);

  const pageHref = (p: number) => {
    const next = new URLSearchParams(
      Object.entries(params).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])),
    );
    next.set("page", String(p));
    return `/movimientos?${next.toString()}`;
  };

  return (
    <>
      <PageHeader
        title={filters.trashed ? "Papelera" : "Movimientos"}
        description={
          filters.trashed
            ? "Movimientos eliminados. No afectan tus saldos hasta que los restaures."
            : `${total} ${total === 1 ? "movimiento" : "movimientos"}${hasQuery ? (total === 1 ? " encontrado" : " encontrados") : ""}`
        }
        actions={
          <>
            <Button
              variant="ghost"
              size="sm"
              render={<Link href={filters.trashed ? "/movimientos" : "/movimientos?view=papelera"} />}
              nativeButton={false}
            >
              {filters.trashed ? <ArrowLeftRight /> : <Trash2 />}
              {filters.trashed ? "Ver movimientos" : "Papelera"}
            </Button>
          </>
        }
      />

      {!filters.trashed && (
        <div className="mb-6">
          <Suspense>
            <TransactionFilters />
          </Suspense>
        </div>
      )}

      {rows.length > 0 ? (
        <TransactionList items={rows} trash={filters.trashed} />
      ) : (
        <Empty className="py-16">
          <EmptyHeader>
            <EmptyMedia variant="icon">{filters.trashed ? <Trash2 /> : <ArrowLeftRight />}</EmptyMedia>
            <EmptyTitle>
              {filters.trashed ? "La papelera está vacía" : hasQuery ? "Sin resultados" : "Aún no hay movimientos"}
            </EmptyTitle>
            <EmptyDescription>
              {filters.trashed
                ? "Los movimientos que elimines aparecerán aquí."
                : hasQuery
                  ? "Prueba con otra búsqueda o quita algunos filtros."
                  : "Registra tu primer ingreso o gasto para empezar."}
            </EmptyDescription>
          </EmptyHeader>
          {!filters.trashed && !hasQuery && <AddTransactionButton />}
        </Empty>
      )}

      {pages > 1 && (
        <nav className="mt-8 flex items-center justify-between text-sm" aria-label="Paginación">
          <PageLink href={pageHref(page - 1)} disabled={page <= 1}>Anterior</PageLink>
          <span className="tabular text-muted-foreground">
            Página {page} de {pages}
          </span>
          <PageLink href={pageHref(page + 1)} disabled={page >= pages}>Siguiente</PageLink>
        </nav>
      )}
    </>
  );
}

function PageLink({ href, disabled, children }: { href: string; disabled: boolean; children: React.ReactNode }) {
  if (disabled) return <span className={cn("px-3 py-1.5 text-muted-foreground/50")}>{children}</span>;
  return (
    <Link href={href} className="rounded-md px-3 py-1.5 hover:bg-muted">
      {children}
    </Link>
  );
}
