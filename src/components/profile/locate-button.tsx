"use client";

import { useState } from "react";
import { useToast } from "@/components/toast";
import { haptics } from "@/lib/haptics";

export type LocatedAddress = {
  line1: string;
  line2: string;
  city: string;
  state: string;
  pincode: string;
  latitude: number;
  longitude: number;
  accuracy: number;
};

/**
 * "Use my location" — pinpoint GPS fix (enableHighAccuracy) reverse-geocoded
 * into address fields. Reports the fix accuracy so users know how precise it is.
 */
export function LocateButton({
  onLocated,
}: {
  onLocated: (address: LocatedAddress) => void;
}) {
  const [locating, setLocating] = useState(false);
  const { toast } = useToast();

  function locate() {
    haptics.tap();
    if (!("geolocation" in navigator)) {
      toast({ title: "Location not supported on this device", variant: "error" });
      return;
    }
    setLocating(true);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude, accuracy } = pos.coords;
          const res = await fetch(
            `/api/geocode?lat=${latitude}&lon=${longitude}`,
          );
          if (res.status === 401) {
            toast({ title: "Sign in to use location", variant: "error" });
            return;
          }
          const body = await res.json();
          if (!res.ok) {
            toast({
              title: "Couldn't resolve your address",
              description: "Fill it manually — coordinates were captured.",
              variant: "error",
            });
            return;
          }
          onLocated({
            line1: body.line1 ?? "",
            line2: body.line2 ?? "",
            city: body.city ?? "",
            state: body.state ?? "",
            pincode: body.pincode ?? "",
            latitude,
            longitude,
            accuracy,
          });
          toast({
            title: "Location detected 📍",
            description: `Accurate to ~${Math.max(1, Math.round(accuracy))}m — review and save.`,
            variant: "success",
          });
        } catch {
          toast({ title: "Network error", variant: "error" });
        } finally {
          setLocating(false);
        }
      },
      (err) => {
        setLocating(false);
        toast({
          title:
            err.code === err.PERMISSION_DENIED
              ? "Location permission denied"
              : "Couldn't get your location",
          description:
            err.code === err.PERMISSION_DENIED
              ? "Allow location access in your browser settings."
              : "Try again near a window or with GPS on.",
          variant: "error",
        });
      },
      // Pinpoint: GPS fix, no cached positions, give it time to lock.
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }

  return (
    <button
      type="button"
      onClick={locate}
      disabled={locating}
      className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/5 px-3.5 py-1.5 text-xs font-semibold text-primary transition-all hover:bg-primary/10 active:scale-[0.97] disabled:opacity-50"
    >
      {locating ? (
        <>
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
          Locating…
        </>
      ) : (
        <>📍 Use my location</>
      )}
    </button>
  );
}
