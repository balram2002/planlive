"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/toast";
import { haptics } from "@/lib/haptics";
import { AddressForm, type SavedAddress } from "./address-form";

/** Full address book: list, set active (one), delete, add (max 3). */
export function AddressManager() {
  const [addresses, setAddresses] = useState<SavedAddress[] | null>(null);
  const [max, setMax] = useState(3);
  const [adding, setAdding] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const { toast } = useToast();

  // Fetch-on-mount + manual reloads (external system → setState in callback).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/addresses");
        if (!res.ok || cancelled) return;
        const body = await res.json();
        setAddresses(body.addresses);
        setMax(body.max);
      } catch {
        // Shown as persistent skeleton; user can retry via reload actions.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const load = useCallback(() => setReloadKey((k) => k + 1), []);

  async function setActive(id: string) {
    haptics.tap();
    setAddresses(
      (prev) =>
        prev?.map((a) => ({ ...a, isActive: a.id === id })) ?? prev,
    );
    const res = await fetch(`/api/addresses/${id}`, { method: "PATCH" });
    if (!res.ok) {
      toast({ title: "Couldn't set active address", variant: "error" });
      load();
    }
  }

  async function remove(id: string) {
    haptics.impact();
    const res = await fetch(`/api/addresses/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast({ title: "Couldn't delete address", variant: "error" });
      return;
    }
    toast({ title: "Address deleted", variant: "success" });
    load();
  }

  if (addresses === null) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="skeleton h-28 rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <AnimatePresence initial={false}>
        {addresses.map((address) => (
          <motion.div
            key={address.id}
            layout
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
          >
            <Card
              className={
                address.isActive ? "border-primary/60 bg-primary/5 p-4" : "p-4"
              }
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{address.label}</span>
                  {address.isActive ? (
                    <Badge tone="primary">Active</Badge>
                  ) : null}
                </div>
                <div className="flex items-center gap-1">
                  {!address.isActive ? (
                    <button
                      type="button"
                      onClick={() => setActive(address.id)}
                      className="rounded-full px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
                    >
                      Set active
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => remove(address.id)}
                    className="rounded-full px-3 py-1.5 text-xs font-medium text-live transition-colors hover:bg-live/10"
                  >
                    Delete
                  </button>
                </div>
              </div>
              <p className="mt-2 text-sm">
                {address.fullName} · {address.phone}
              </p>
              <p className="mt-0.5 text-sm text-muted">
                {address.line1}
                {address.line2 ? `, ${address.line2}` : ""}, {address.city},{" "}
                {address.state} — {address.pincode}
              </p>
            </Card>
          </motion.div>
        ))}
      </AnimatePresence>

      {addresses.length === 0 && !adding ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-faint">
          No addresses yet — add one for faster checkout.
        </p>
      ) : null}

      {adding ? (
        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold">New address</h2>
          <AddressForm
            compact
            onCancel={() => setAdding(false)}
            onCreated={() => {
              setAdding(false);
              load();
            }}
          />
        </Card>
      ) : addresses.length < max ? (
        <Button
          variant="secondary"
          className="w-full"
          onClick={() => setAdding(true)}
        >
          + Add address ({addresses.length}/{max})
        </Button>
      ) : (
        <p className="text-center text-xs text-faint">
          Maximum {max} addresses — delete one to add another.
        </p>
      )}
    </div>
  );
}
