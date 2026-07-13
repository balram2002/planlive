import * as React from "react";
import { cn } from "@/lib/cn";

// text-base (16px) is deliberate: anything smaller triggers iOS Safari's
// auto-zoom when a field gains focus, which breaks the app-like feel.
const fieldStyles =
  "w-full rounded-xl border border-border bg-surface-2 px-3.5 py-2.5 text-base text-foreground placeholder:text-faint focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/30";

export function Label({
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("mb-1.5 block text-sm font-medium text-muted", className)}
      {...props}
    />
  );
}

export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldStyles, className)} {...props} />;
}

export function Textarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea className={cn(fieldStyles, "resize-none", className)} {...props} />
  );
}

/** Groups a label + field + optional hint/error with consistent spacing. */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p className="mt-1.5 text-xs text-live">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-faint">{hint}</p>
      ) : null}
    </div>
  );
}
