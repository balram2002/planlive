"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/action-button";
import { Field, Input } from "@/components/ui/input";
import { ImageUploader } from "@/components/upload/image-uploader";
import { useToast } from "@/components/toast";
import {
  createCategory,
  type CategoryState,
} from "@/app/(seller)/dashboard/categories/actions";

export function CategoryForm() {
  const [state, formAction, pending] = useActionState<CategoryState, FormData>(
    createCategory,
    {},
  );
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (state.error) toast({ title: state.error, variant: "error" });
  }, [state, toast]);

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Category name" htmlFor="cat-name">
          <Input
            id="cat-name"
            name="name"
            placeholder="Sneakers"
            required
            maxLength={40}
          />
        </Field>
        <Field label="Subcategory (optional)" htmlFor="cat-sub">
          <Input
            id="cat-sub"
            name="subcategory"
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
        aspect="square"
        maxWidth={512}
      />
      <input type="hidden" name="imageUrl" value={imageUrl ?? ""} />
      {!imageUrl ? (
        <p className="-mt-2 text-xs text-faint">
          Shown in the buyer&apos;s category carousel — an image is required.
        </p>
      ) : null}

      <Button
        type="submit"
        disabled={pending || !imageUrl}
        className="w-full"
      >
        {pending ? (
          <span className="inline-flex items-center gap-2"><Spinner /> Creating…</span>
        ) : !imageUrl ? (
          "Add an image to continue"
        ) : (
          "Add category"
        )}
      </Button>
    </form>
  );
}
