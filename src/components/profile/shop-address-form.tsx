"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { useToast } from "@/components/toast";
import { LocateButton, type LocatedAddress } from "./locate-button";
import {
  updateShopAddress,
  type ProfileFormState,
} from "@/app/(shop)/profile/actions";

export type ShopAddress = {
  shopName: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  pincode: string;
  latitude: number | null;
  longitude: number | null;
};

/** Seller shop address with pinpoint "use my location" autofill. */
export function ShopAddressForm({ initial }: { initial: ShopAddress | null }) {
  const [state, formAction, pending] = useActionState<ProfileFormState, FormData>(
    updateShopAddress,
    {},
  );
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(
    initial?.latitude != null && initial?.longitude != null
      ? { lat: initial.latitude, lon: initial.longitude }
      : null,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (state.success) toast({ title: state.success, variant: "success" });
    else if (state.error) toast({ title: state.error, variant: "error" });
  }, [state, toast]);

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

  return (
    <form ref={formRef} action={formAction} className="space-y-3.5">
      <div className="flex items-center justify-between">
        <LocateButton onLocated={fillFromLocation} />
        {coords ? (
          <span className="text-[10px] tabular-nums text-success">
            📍 pinned ({coords.lat.toFixed(5)}, {coords.lon.toFixed(5)})
          </span>
        ) : null}
      </div>
      <input type="hidden" name="latitude" value={coords?.lat ?? ""} />
      <input type="hidden" name="longitude" value={coords?.lon ?? ""} />

      <div className="grid grid-cols-2 gap-3">
        <Field label="Shop name" htmlFor="shop-name">
          <Input
            id="shop-name"
            name="shopName"
            defaultValue={initial?.shopName ?? ""}
            placeholder="Ritu's Thrift Corner"
            required
            maxLength={60}
          />
        </Field>
        <Field label="Shop phone" htmlFor="shop-phone">
          <Input
            id="shop-phone"
            name="phone"
            type="tel"
            defaultValue={initial?.phone ?? ""}
            placeholder="98765 43210"
            maxLength={15}
          />
        </Field>
      </div>

      <Field label="Address line 1" htmlFor="shop-line1">
        <Input
          id="shop-line1"
          name="line1"
          defaultValue={initial?.line1 ?? ""}
          placeholder="Shop no, street"
          required
          maxLength={120}
        />
      </Field>
      <Field label="Address line 2 (optional)" htmlFor="shop-line2">
        <Input
          id="shop-line2"
          name="line2"
          defaultValue={initial?.line2 ?? ""}
          placeholder="Market, landmark"
          maxLength={120}
        />
      </Field>

      <div className="grid grid-cols-3 gap-3">
        <Field label="City" htmlFor="shop-city">
          <Input id="shop-city" name="city" defaultValue={initial?.city ?? ""} required maxLength={60} />
        </Field>
        <Field label="State" htmlFor="shop-state">
          <Input id="shop-state" name="state" defaultValue={initial?.state ?? ""} required maxLength={60} />
        </Field>
        <Field label="PIN" htmlFor="shop-pin">
          <Input
            id="shop-pin"
            name="pincode"
            defaultValue={initial?.pincode ?? ""}
            inputMode="numeric"
            pattern="\d{6}"
            required
          />
        </Field>
      </div>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Saving…" : "Save shop address"}
      </Button>
    </form>
  );
}
