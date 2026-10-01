import type { Metadata } from "next";
import { Goal, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { GoalDialog } from "@/components/goals/goal-dialogs";
import { GoalItem } from "@/components/goals/goal-item";
import { Money } from "@/components/shared/money";
import { PageHeader, SectionHeader } from "@/components/shared/page-header";
import { requirePageUser } from "@/server/auth/guard";
import { db } from "@/server/db";
import { listAccounts } from "@/server/services/accounts";
import { listGoals } from "@/server/services/goals";

export const metadata: Metadata = { title: "Metas" };

export default async function GoalsPage() {
  const user = await requirePageUser();
  const [goals, accounts] = await Promise.all([listGoals(db, user.id, { includeArchived: true }), listAccounts(db, user.id)]);
  const accountOptions = accounts.map((a) => ({ id: a.id, name: a.name }));
  const active = goals.filter((g) => g.status === "ACTIVE");
  const completed = goals.filter((g) => g.status === "COMPLETED");
  const archived = goals.filter((g) => g.status === "ARCHIVED");
  const totalSaved = [...active, ...completed].reduce((s, g) => s + g.saved, 0n);
  const newGoal = (variant: "default" | "outline") => (
    <GoalDialog accounts={accountOptions} trigger={<Button variant={variant}><Plus /> Nueva meta</Button>} />
  );

  return (
    <>
      <PageHeader
        title="Metas de ahorro"
        description={goals.length > 0 ? <>Tienes <Money amount={totalSaved} className="text-foreground" /> apartados en tus metas.</> : "Aparta dinero para lo que quieres lograr."}
        actions={goals.length > 0 && newGoal("default")}
      />

      {goals.length === 0 && (
        <Empty className="py-16">
          <EmptyHeader>
            <EmptyMedia variant="icon"><Goal /></EmptyMedia>
            <EmptyTitle>Aún no tienes metas</EmptyTitle>
            <EmptyDescription>Crea una meta (por ejemplo, &ldquo;PC nueva&rdquo;) y Finora calculará cuánto ahorrar cada mes para lograrla.</EmptyDescription>
          </EmptyHeader>
          {newGoal("outline")}
        </Empty>
      )}

      {active.length > 0 && (
        <section>
          <SectionHeader title="En progreso" />
          <ul className="divide-y divide-border/60">
            {active.map((g) => <GoalItem key={g.id} goal={g} accounts={accountOptions} />)}
          </ul>
        </section>
      )}
      {completed.length > 0 && (
        <section className="mt-10">
          <SectionHeader title="Completadas" />
          <ul className="divide-y divide-border/60">
            {completed.map((g) => <GoalItem key={g.id} goal={g} accounts={accountOptions} />)}
          </ul>
        </section>
      )}
      {archived.length > 0 && (
        <section className="mt-10">
          <SectionHeader title="Archivadas" />
          <ul className="divide-y divide-border/60">
            {archived.map((g) => <GoalItem key={g.id} goal={g} accounts={accountOptions} />)}
          </ul>
        </section>
      )}
    </>
  );
}
