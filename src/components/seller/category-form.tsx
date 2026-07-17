"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
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
        label="Category image (optional)"
        value={imageUrl}
        onChange={setImageUrl}
        aspect="square"
        maxWidth={512}
      />
      <input type="hidden" name="imageUrl" value={imageUrl ?? ""} />

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Adding…" : "Add category"}
      </Button>
    </form>
  );
}
