"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/action-button";
import { Field, Input } from "@/components/ui/input";
import { useToast } from "@/components/toast";
import { LocateButton, type LocatedAddress } from "./locate-button";
import { ShopLocationMap } from "./shop-location-map";
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
export function ShopAddressForm({
  initial,
  pickupLocationCode,
}: {
  initial: ShopAddress | null;
  /** Eshopbox warehouse code for this seller's pickups. */
  pickupLocationCode?: string | null;
}) {
  const [state, formAction, pending] = useActionState<
    ProfileFormState,
    FormData
  >(updateShopAddress, {});
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(
    initial?.latitude != null && initial?.longitude != null
      ? { lat: initial.latitude, lon: initial.longitude }
      : null,
  );
  const [mapsUrl, setMapsUrl] = useState("");
  const [mapsUrlBusy, setMapsUrlBusy] = useState(false);
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

  /** Manual lat/lng entry — either field alone is kept, since one may still
   *  be mid-edit while the other has a valid value. */
  function editCoord(which: "lat" | "lon", raw: string) {
    const n = raw.trim() === "" ? null : Number(raw);
    setCoords((prev) => {
      const next = {
        lat: which === "lat" ? n : (prev?.lat ?? null),
        lon: which === "lon" ? n : (prev?.lon ?? null),
      };
      if (next.lat == null || next.lon == null) return null;
      if (!Number.isFinite(next.lat) || !Number.isFinite(next.lon)) {
        return prev; // Mid-typing an invalid number — don't drop the other field.
      }
      return { lat: next.lat, lon: next.lon };
    });
  }

  async function useMapsUrl() {
    const url = mapsUrl.trim();
    if (!url) return;
    setMapsUrlBusy(true);
    try {
      const res = await fetch(`/api/parse-maps-url?url=${encodeURIComponent(url)}`);
      const body = await res.json();
      if (!res.ok) {
        toast({ title: body.error ?? "Couldn't read that link", variant: "error" });
        return;
      }
      setCoords({ lat: body.latitude, lon: body.longitude });
      toast({ title: "Location pinned from the link 📍", variant: "success" });
    } catch {
      toast({ title: "Network error", variant: "error" });
    } finally {
      setMapsUrlBusy(false);
    }
  }

  return (
    <form ref={formRef} action={formAction} className="space-y-3.5">
      <input type="hidden" name="latitude" value={coords?.lat ?? ""} />
      <input type="hidden" name="longitude" value={coords?.lon ?? ""} />

      <div className="space-y-2.5 rounded-2xl border border-border bg-surface-2/50 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-muted">Shop location</p>
          <LocateButton onLocated={fillFromLocation} />
        </div>

        {/* Free OpenStreetMap picker — click or drag the pin to the exact spot. */}
        <ShopLocationMap
          latitude={coords?.lat ?? null}
          longitude={coords?.lon ?? null}
          onChange={(lat, lon) => setCoords({ lat, lon })}
        />

        <div className="grid grid-cols-2 gap-3">
          <Field label="Latitude" htmlFor="shop-lat">
            <Input
              id="shop-lat"
              type="number"
              step="any"
              min={-90}
              max={90}
              inputMode="decimal"
              value={coords?.lat ?? ""}
              onChange={(e) => editCoord("lat", e.target.value)}
              placeholder="28.61390"
            />
          </Field>
          <Field label="Longitude" htmlFor="shop-lon">
            <Input
              id="shop-lon"
              type="number"
              step="any"
              min={-180}
              max={180}
              inputMode="decimal"
              value={coords?.lon ?? ""}
              onChange={(e) => editCoord("lon", e.target.value)}
              placeholder="77.20900"
            />
          </Field>
        </div>

        <Field
          label="Or paste a Google Maps link"
          htmlFor="shop-maps-url"
          hint="Share → Copy link from Google Maps. Works with goo.gl short links too."
        >
          <div className="flex gap-2">
            <Input
              id="shop-maps-url"
              type="url"
              value={mapsUrl}
              onChange={(e) => setMapsUrl(e.target.value)}
              placeholder="https://maps.app.goo.gl/..."
              className="flex-1"
            />
            <Button
              type="button"
              variant="secondary"
              onClick={useMapsUrl}
              disabled={mapsUrlBusy || !mapsUrl.trim()}
            >
              {mapsUrlBusy ? <Spinner /> : "Use link"}
            </Button>
          </div>
        </Field>

        {coords ? (
          <p className="text-[10px] tabular-nums text-success">
            📍 pinned ({coords.lat.toFixed(5)}, {coords.lon.toFixed(5)})
          </p>
        ) : (
          <p className="text-[10px] text-faint">
            No exact location pinned yet — couriers will use the address text below.
          </p>
        )}
      </div>

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
          <Input
            id="shop-city"
            name="city"
            defaultValue={initial?.city ?? ""}
            required
            maxLength={60}
          />
        </Field>
        <Field label="State" htmlFor="shop-state">
          <Input
            id="shop-state"
            name="state"
            defaultValue={initial?.state ?? ""}
            required
            maxLength={60}
          />
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

      {/* Courier pickup — Eshopbox collects parcels from this location. */}
      <Field
        label="Eshopbox pickup location code"
        htmlFor="shop-pickup"
        hint="Optional · from your Eshopbox workspace. Leave blank to use the marketplace default."
      >
        <Input
          id="shop-pickup"
          name="pickupLocationCode"
          defaultValue={pickupLocationCode ?? ""}
          placeholder="e.g. WH-DEL-01"
          maxLength={40}
        />
      </Field>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? (
          <span className="inline-flex items-center gap-2">
            <Spinner /> Saving…
          </span>
        ) : (
          "Save shop address"
        )}
      </Button>
    </form>
  );
}
