"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/action-button";
import { Field, Input } from "@/components/ui/input";
import { ImageUploader } from "@/components/upload/image-uploader";
import { useToast } from "@/components/toast";
import {
  createCategory,
  updateCategory,
  type CategoryState,
} from "@/app/(seller)/dashboard/categories/actions";

export type CategoryDefaults = {
  id: string;
  name: string;
  subcategory: string | null;
  imageUrl: string | null;
};

/**
 * Create or edit a category. Passing `defaults` switches the form into edit
 * mode — same fields, same validation, so the two paths can't drift apart.
 */
export function CategoryForm({
  defaults,
  onDone,
}: {
  defaults?: CategoryDefaults;
  /** Called after a successful save — used to close the inline editor. */
  onDone?: () => void;
}) {
  const editing = Boolean(defaults);
  const [state, formAction, pending] = useActionState<CategoryState, FormData>(
    editing ? updateCategory : createCategory,
    {},
  );
  const [imageUrl, setImageUrl] = useState<string | null>(
    defaults?.imageUrl ?? null,
  );
  const { toast } = useToast();

  useEffect(() => {
    if (state.error) toast({ title: state.error, variant: "error" });
  }, [state, toast]);

  // A successful edit returns a fresh empty state; the action revalidates the
  // list, so all that's left is closing the editor. Render-phase adjustment
  // rather than an effect (react.dev "adjusting state during render").
  const [lastState, setLastState] = useState(state);
  if (state !== lastState) {
    setLastState(state);
    if (editing && !state.error) onDone?.();
  }

  const uid = defaults?.id ?? "new";

  return (
    <form action={formAction} className="space-y-4">
      {defaults ? <input type="hidden" name="id" value={defaults.id} /> : null}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Category name" htmlFor={`cat-name-${uid}`}>
          <Input
            id={`cat-name-${uid}`}
            name="name"
            defaultValue={defaults?.name}
            placeholder="Sneakers"
            required
            maxLength={40}
          />
        </Field>
        <Field label="Subcategory (optional)" htmlFor={`cat-sub-${uid}`}>
          <Input
            id={`cat-sub-${uid}`}
            name="subcategory"
            defaultValue={defaults?.subcategory ?? ""}
            placeholder="Running"
            maxLength={40}
          />
        </Field>
      </div>

      <ImageUploader
        kind="category"
        label="Category image (required)"
        value={imageUrl}
        onChange={setImageUrl}
        aspect="tile"
        maxWidth={512}
      />
      <input type="hidden" name="imageUrl" value={imageUrl ?? ""} />
      {!imageUrl ? (
        <p className="-mt-2 text-xs text-faint">
          Shown in the buyer&apos;s category carousel — an image is required.
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending || !imageUrl} className="flex-1">
          {pending ? (
            <span className="inline-flex items-center gap-2">
              <Spinner /> Saving…
            </span>
          ) : !imageUrl ? (
            "Add an image to continue"
          ) : editing ? (
            "Save changes"
          ) : (
            "Add category"
          )}
        </Button>
        {onDone ? (
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
