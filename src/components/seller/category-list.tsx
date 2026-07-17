import Image from "next/image";
import type { Category } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  deleteCategory,
  toggleCategory,
} from "@/app/(seller)/dashboard/categories/actions";

/**
 * Category rows with active toggle (owner or admin) and delete (admin only).
 * Only ACTIVE categories surface on the buyer homepage / go-live picker.
 */
export function CategoryList({
  categories,
  viewerId,
  viewerIsAdmin,
}: {
  categories: Category[];
  viewerId: string;
  viewerIsAdmin: boolean;
}) {
  if (categories.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-faint">
        No categories yet — add the first one.
      </p>
    );
  }

  return (
    <ul className="grid gap-2.5 lg:grid-cols-2">
      {categories.map((category) => {
        const canToggle = viewerIsAdmin || category.createdBy === viewerId;
        return (
          <li key={category.id}>
            <Card className="flex items-center gap-3 p-3">
              <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-surface-2">
                {category.imageUrl ? (
                  <Image
                    src={category.imageUrl}
                    alt={category.name}
                    fill
                    sizes="44px"
                    className="object-cover"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-lg">
                    🗂️
                  </span>
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {category.name}
                  {category.subcategory ? (
                    <span className="text-muted"> · {category.subcategory}</span>
                  ) : null}
                </p>
                <div className="mt-0.5">
                  {category.isActive ? (
                    <Badge tone="success">Active</Badge>
                  ) : (
                    <Badge tone="warning">Hidden</Badge>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {canToggle ? (
                  <form action={toggleCategory}>
                    <input type="hidden" name="id" value={category.id} />
                    <button
                      type="submit"
                      className="rounded-full px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
                    >
                      {category.isActive ? "Hide" : "Activate"}
                    </button>
                  </form>
                ) : null}
                {viewerIsAdmin ? (
                  <form action={deleteCategory}>
                    <input type="hidden" name="id" value={category.id} />
                    <button
                      type="submit"
                      className="rounded-full px-3 py-1.5 text-xs font-medium text-live transition-colors hover:bg-live/10"
                    >
                      Delete
                    </button>
                  </form>
                ) : null}
              </div>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
