"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/action-button";
import { Field, Input } from "@/components/ui/input";
import { ImageUploader } from "@/components/upload/image-uploader";
import { useToast } from "@/components/toast";
import {
  updateProfile,
  type ProfileFormState,
} from "@/app/(shop)/profile/actions";

const genders = [
  { value: "", label: "Prefer not to say" },
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
];

export function ProfileForm({
  defaults,
}: {
  defaults: {
    username: string;
    name: string;
    phone: string;
    imageUrl: string | null;
    birthday: string; // yyyy-mm-dd or ""
    gender: string;
  };
}) {
  const [state, formAction, pending] = useActionState<ProfileFormState, FormData>(
    updateProfile,
    {},
  );
  const [imageUrl, setImageUrl] = useState<string | null>(defaults.imageUrl);
  const { toast } = useToast();

  useEffect(() => {
    if (state.success) toast({ title: state.success, variant: "success" });
    else if (state.error) toast({ title: state.error, variant: "error" });
  }, [state, toast]);

  return (
    <form action={formAction} className="space-y-5">
      <ImageUploader
        kind="avatar"
        label="Profile picture"
        value={imageUrl}
        onChange={setImageUrl}
        aspect="square"
        maxWidth={512}
      />
      <input type="hidden" name="imageUrl" value={imageUrl ?? ""} />

      <Field
        label="Username"
        htmlFor="username"
        hint="Required · 3–20 chars · lowercase letters, numbers, _"
      >
        <Input
          id="username"
          name="username"
          defaultValue={defaults.username}
          placeholder="your_handle"
          pattern="[a-z0-9_]{3,20}"
          required
        />
      </Field>

      <Field label="Name" htmlFor="name">
        <Input
          id="name"
          name="name"
          defaultValue={defaults.name}
          placeholder="Your full name"
          maxLength={60}
        />
      </Field>

      <Field
        label="WhatsApp number"
        htmlFor="phone"
        hint="Optional · we'll send order and account updates here"
      >
        <Input
          id="phone"
          name="phone"
          type="tel"
          inputMode="tel"
          defaultValue={defaults.phone}
          placeholder="98765 43210"
          maxLength={15}
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Birthday" htmlFor="birthday">
          <Input
            id="birthday"
            name="birthday"
            type="date"
            defaultValue={defaults.birthday}
          />
        </Field>
        <Field label="Gender" htmlFor="gender">
          <select
            id="gender"
            name="gender"
            defaultValue={defaults.gender}
            className="w-full rounded-xl border border-border bg-surface-2 px-3.5 py-2.5 text-base text-foreground focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            {genders.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {state.error ? (
        <p className="rounded-xl border border-live/30 bg-live/10 px-3 py-2 text-sm text-live">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? (
          <span className="inline-flex items-center gap-2"><Spinner /> Saving…</span>
        ) : (
          "Save profile"
        )}
      </Button>
    </form>
  );
}
