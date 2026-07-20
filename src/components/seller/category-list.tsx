"use client";

import { useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "motion/react";
import type { Category } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ActionButton } from "@/components/ui/action-button";
import { CategoryForm } from "@/components/seller/category-form";
import {
  deleteCategory,
  toggleCategory,
} from "@/app/(seller)/dashboard/categories/actions";

/**
 * Category rows with inline edit, an active toggle and delete.
 *
 * Permissions mirror the server actions exactly: admins manage everything,
 * sellers only the categories they created. The server re-checks all of it —
 * these flags just avoid showing controls that would silently no-op.
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
  const [editingId, setEditingId] = useState<string | null>(null);

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
        const canManage = viewerIsAdmin || category.createdBy === viewerId;
        const editing = editingId === category.id;

        return (
          <li key={category.id} className={editing ? "lg:col-span-2" : undefined}>
            <Card className="overflow-hidden">
              <div className="flex items-center gap-3 p-3">
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
                  {canManage ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setEditingId(editing ? null : category.id)}
                        aria-expanded={editing}
                        className="rounded-full px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
                      >
                        {editing ? "Close" : "Edit"}
                      </button>

                      <form action={toggleCategory}>
                        <input type="hidden" name="id" value={category.id} />
                        <ActionButton
                          haptic="tap"
                          className="rounded-full px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
                        >
                          {category.isActive ? "Hide" : "Activate"}
                        </ActionButton>
                      </form>

                      <form action={deleteCategory}>
                        <input type="hidden" name="id" value={category.id} />
                        <ActionButton
                          haptic="impact"
                          className="rounded-full px-3 py-1.5 text-xs font-medium text-live transition-colors hover:bg-live/10"
                        >
                          Delete
                        </ActionButton>
                      </form>
                    </>
                  ) : null}
                </div>
              </div>

              <AnimatePresence initial={false}>
                {editing ? (
                  <motion.div
                    key="editor"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.22, ease: "easeOut" }}
                    className="overflow-hidden"
                  >
                    <div className="border-t border-border/60 bg-surface-2/40 p-4">
                      <CategoryForm
                        defaults={{
                          id: category.id,
                          name: category.name,
                          subcategory: category.subcategory,
                          imageUrl: category.imageUrl,
                        }}
                        onDone={() => setEditingId(null)}
                      />
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
