import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, isSeller } from "@/lib/current-user";
import { ScheduleForm } from "@/components/seller/schedule-form";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ActionButton } from "@/components/ui/action-button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { deleteSchedule } from "./actions";

export const dynamic = "force-dynamic";

/** All data + time-sensitive flags gathered outside render (purity lint). */
async function loadScheduleData(sellerId: string) {
  const [schedules, products] = await Promise.all([
    prisma.scheduledStream.findMany({
      where: { sellerId },
      orderBy: { scheduledFor: "asc" },
    }),
    prisma.product.findMany({
      where: { sellerId },
      orderBy: { title: "asc" },
      select: { id: true, title: true, priceInPaise: true },
    }),
  ]);
  const now = Date.now();
  return {
    products,
    schedules: schedules.map((s) => ({
      ...s,
      due: s.scheduledFor.getTime() <= now,
    })),
  };
}

/** Plan streams ahead: create, review, start-now, or drop planned lives. */
export default async function SchedulePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  if (!isSeller(user) || !user.isActive) redirect("/dashboard");

  const { schedules, products } = await loadScheduleData(user.id);

  return (
    <div className="animate-page-in space-y-6 lg:grid lg:grid-cols-2 lg:items-start lg:gap-8 lg:space-y-0">
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Schedule</h1>
          <p className="text-sm text-muted">
            Plan your lives ahead — lineup, cover, and timing ready to go.
          </p>
        </div>

        {schedules.length === 0 ? (
          <EmptyState
            icon="🗓️"
            title="Nothing planned yet"
            description="Schedule your next live so you can prep the lineup in advance."
          />
        ) : (
          <ul className="space-y-3">
            {schedules.map((schedule) => {
              const due = schedule.due;
              return (
                <li key={schedule.id}>
                  <Card className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">
                          {schedule.title}
                        </p>
                        <p className="mt-0.5 text-xs text-muted">
                          {schedule.scheduledFor.toLocaleString("en-IN", {
                            weekday: "short",
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}{" "}
                          · {schedule.productIds.length} products planned
                        </p>
                      </div>
                      {due ? (
                        <Badge tone="live">Due</Badge>
                      ) : (
                        <Badge tone="primary">Upcoming</Badge>
                      )}
                    </div>
                    <div className="mt-3 flex gap-2">
                      <ButtonLink
                        href={`/go-live?from=${schedule.id}`}
                        size="sm"
                        className="flex-1"
                      >
                        {due ? "🔴 Go live now" : "Start early"}
                      </ButtonLink>
                      <form action={deleteSchedule}>
                        <input type="hidden" name="id" value={schedule.id} />
                        <ActionButton
                          haptic="impact"
                          className="rounded-full px-3 py-2 text-xs font-medium text-live transition-colors hover:bg-live/10"
                        >
                          Delete
                        </ActionButton>
                      </form>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Card className="p-5">
        <h2 className="mb-4 text-sm font-semibold">Plan a new stream</h2>
        <ScheduleForm products={products} />
      </Card>
    </div>
  );
}
