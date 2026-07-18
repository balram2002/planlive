"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/action-button";
import { Field, Input } from "@/components/ui/input";
import { useToast } from "@/components/toast";
import { LocateButton, type LocatedAddress } from "./locate-button";

export type SavedAddress = {
  id: string;
  label: string;
  fullName: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  pincode: string;
  latitude: number | null;
  longitude: number | null;
  isActive: boolean;
};

/**
 * Compact create-address form posting to /api/addresses, with pinpoint
 * "use my location" autofill (fields prefilled + exact coords attached).
 */
export function AddressForm({
  onCreated,
  onCancel,
  compact = false,
}: {
  onCreated: (address: SavedAddress) => void;
  onCancel?: () => void;
  compact?: boolean;
}) {
  const [saving, setSaving] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const { toast } = useToast();

  function fillFromLocation(located: LocatedAddress) {
    const form = formRef.current;
    if (!form) return;
    const set = (name: string, value: string) => {
      const el = form.elements.namedItem(name) as HTMLInputElement | null;
      if (el && value) el.value = value;
    };
    set("line1", located.line1);
    set("line2", located.line2);
    set("city", located.city);
    set("state", located.state);
    set("pincode", located.pincode);
    setCoords({ lat: located.latitude, lon: located.longitude });
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/addresses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...Object.fromEntries(form.entries()),
          latitude: coords?.lat,
          longitude: coords?.lon,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        toast({ title: body.error ?? "Couldn't save address", variant: "error" });
        return;
      }
      toast({ title: "Address saved", variant: "success" });
      onCreated(body.address);
    } catch {
      toast({ title: "Network error", variant: "error" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={submit} className="space-y-3.5">
      <div className="flex items-center justify-between">
        <LocateButton onLocated={fillFromLocation} />
        {coords ? (
          <span className="text-[10px] tabular-nums text-success">
            📍 pinned ({coords.lat.toFixed(5)}, {coords.lon.toFixed(5)})
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Label" htmlFor="addr-label">
          <Input id="addr-label" name="label" placeholder="Home" maxLength={24} />
        </Field>
        <Field label="Full name" htmlFor="addr-name">
          <Input id="addr-name" name="fullName" placeholder="Receiver's name" required maxLength={60} />
        </Field>
      </div>

      <Field label="Phone" htmlFor="addr-phone">
        <Input
          id="addr-phone"
          name="phone"
          type="tel"
          inputMode="tel"
          placeholder="98765 43210"
          required
        />
      </Field>

      <Field label="Address line 1" htmlFor="addr-line1">
        <Input id="addr-line1" name="line1" placeholder="House no, street" required maxLength={120} />
      </Field>
      <Field label="Address line 2 (optional)" htmlFor="addr-line2">
        <Input id="addr-line2" name="line2" placeholder="Area, landmark" maxLength={120} />
      </Field>

      <div className="grid grid-cols-3 gap-3">
        <Field label="City" htmlFor="addr-city">
          <Input id="addr-city" name="city" required maxLength={60} />
        </Field>
        <Field label="State" htmlFor="addr-state">
          <Input id="addr-state" name="state" required maxLength={60} />
        </Field>
        <Field label="PIN" htmlFor="addr-pin">
          <Input
            id="addr-pin"
            name="pincode"
            inputMode="numeric"
            pattern="\d{6}"
            placeholder="6 digits"
            required
          />
        </Field>
      </div>

      <div className="flex gap-2 pt-1">
        <Button type="submit" disabled={saving} className="flex-1" size={compact ? "md" : "lg"}>
          {saving ? (
            <span className="inline-flex items-center gap-2"><Spinner /> Saving…</span>
          ) : (
            "Save address"
          )}
        </Button>
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel} size={compact ? "md" : "lg"}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
