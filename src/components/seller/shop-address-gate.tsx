"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Field, Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/action-button";
import { useToast } from "@/components/toast";
import {
  LocateButton,
  type LocatedAddress,
} from "@/components/profile/locate-button";
import { haptics } from "@/lib/haptics";
import { cn } from "@/lib/cn";
import {
  updateShopAddress,
  type ProfileFormState,
} from "@/app/(shop)/profile/actions";

/**
 * Blocking two-step setup for a seller with no shop address.
 *
 * Shipping cannot work without this: Eshopbox needs a pickup location, and
 * when the account has no warehouse code registered we send this address
 * inline instead. A seller who skips it hits "PickupLocation.contact number
 * cannot be blank" at booking time — a message they can do nothing with. So
 * the gate collects it up front, where the context makes sense.
 *
 * Both steps live in ONE form with step 1's fields kept mounted (hidden), so
 * the whole thing submits together and nothing is lost moving between steps.
 */
export function ShopAddressGate({ open }: { open: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [state, formAction, pending] = useActionState<
    ProfileFormState,
    FormData
  >(updateShopAddress, {});

  const [dismissed, setDismissed] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(
    null,
  );
  const formRef = useRef<HTMLFormElement>(null);

  // Step 1 values are controlled so "Next" can validate before advancing.
  const [shopName, setShopName] = useState("");
  const [phone, setPhone] = useState("");

  // Saving flips this permanently for the session; "Later" only collapses the
  // sheet to the banner below, which re-opens it. Sending the seller off to
  // another page to do it was the reported friction.
  const [saved, setSaved] = useState(false);
  const visible = open && !dismissed && !saved;

  useEffect(() => {
    if (state.error) toast({ title: state.error, variant: "error" });
  }, [state.error, toast]);

  const handled = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!state.success || state.success === handled.current) return;
    handled.current = state.success;
    toast({
      title: "Shop address saved — you can ship now.",
      variant: "success",
    });
    setSaved(true);
    router.refresh();
  }, [state.success, toast, router]);

  useEffect(() => {
    if (!visible) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [visible]);

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

  const step1Valid =
    shopName.trim().length >= 2 && /^\d{10,15}$/.test(phone.trim());

  // Dismissed but still not set up: a banner that re-opens the same sheet,
  // so the fix is always one tap away and never a trip to another screen.
  if (open && !saved && dismissed) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-warning/30 bg-warning/5 p-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-warning">
            Add a pickup address to start shipping
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted">
            Couriers need somewhere to collect from — takes about a minute.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            haptics.tap();
            setDismissed(false);
          }}
          className="shrink-0 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-all active:scale-95"
        >
          Add it now
        </button>
      </div>
    );
  }

  return (
    <AnimatePresence>
      {visible ? (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-[2px]"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Set up your shop address"
            data-no-swipe
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 360, damping: 32 }}
            className="fixed inset-x-0 bottom-0 z-[90] mx-auto flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-b-0 border-border bg-surface shadow-pop sm:inset-0 sm:my-auto sm:h-fit sm:rounded-3xl sm:border-b"
          >
            {/* Header */}
            <div className="shrink-0 border-b border-border px-5 pb-4 pt-5">
              <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border sm:hidden" />
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold">Set up shipping</h2>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted">
                    Couriers collect parcels from this address. Without it,
                    bookings are rejected.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDismissed(true)}
                  className="shrink-0 rounded-full px-2.5 py-1 text-xs font-medium text-faint transition-colors hover:bg-surface-2 hover:text-muted"
                >
                  Later
                </button>
              </div>

              {/* Step indicator */}
              <div className="mt-4 flex items-center gap-2">
                {[1, 2].map((n) => (
                  <div key={n} className="flex flex-1 items-center gap-2">
                    <span
                      className={cn(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition-colors",
                        step >= n
                          ? "bg-primary text-primary-foreground"
                          : "bg-surface-2 text-faint",
                      )}
                    >
                      {n}
                    </span>
                    <span
                      className={cn(
                        "h-0.5 flex-1 rounded-full transition-colors",
                        step > n ? "bg-primary" : "bg-border",
                      )}
                    />
                  </div>
                ))}
              </div>
            </div>

            <form
              ref={formRef}
              id="shop-address-gate-form"
              action={formAction}
              className="min-h-0 flex-1 overflow-y-auto px-5 py-4"
            >
              <input type="hidden" name="latitude" value={coords?.lat ?? ""} />
              <input type="hidden" name="longitude" value={coords?.lon ?? ""} />

              {/* Step 1 stays mounted when on step 2 so its values submit. */}
              <div className={cn("space-y-4", step !== 1 && "hidden")}>
                <Field
                  label="Shop name"
                  htmlFor="gate-shop-name"
                  hint="Shown to the courier as the pickup contact."
                >
                  <Input
                    id="gate-shop-name"
                    name="shopName"
                    value={shopName}
                    onChange={(e) => setShopName(e.target.value)}
                    placeholder="Ritu's Thrift Corner"
                    maxLength={60}
                    autoComplete="organization"
                  />
                </Field>
                <Field
                  label="Pickup phone number"
                  htmlFor="gate-shop-phone"
                  hint="The delivery agent calls this number to collect."
                >
                  <Input
                    id="gate-shop-phone"
                    name="phone"
                    type="tel"
                    inputMode="numeric"
                    value={phone}
                    onChange={(e) =>
                      setPhone(e.target.value.replace(/\D/g, ""))
                    }
                    placeholder="9876543210"
                    maxLength={15}
                    autoComplete="tel"
                  />
                </Field>
              </div>

              <div className={cn("space-y-4", step !== 2 && "hidden")}>
                <div className="flex items-center justify-between gap-2">
                  <LocateButton onLocated={fillFromLocation} />
                  {coords ? (
                    <span className="text-[10px] tabular-nums text-success">
                      📍 pinned
                    </span>
                  ) : null}
                </div>

                <Field label="Address line 1" htmlFor="gate-line1">
                  <Input
                    id="gate-line1"
                    name="line1"
                    placeholder="Shop no, street"
                    maxLength={120}
                    autoComplete="address-line1"
                  />
                </Field>
                <Field label="Address line 2 (optional)" htmlFor="gate-line2">
                  <Input
                    id="gate-line2"
                    name="line2"
                    placeholder="Market, landmark"
                    maxLength={120}
                    autoComplete="address-line2"
                  />
                </Field>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <Field label="City" htmlFor="gate-city">
                    <Input
                      id="gate-city"
                      name="city"
                      maxLength={60}
                      autoComplete="address-level2"
                    />
                  </Field>
                  <Field label="State" htmlFor="gate-state">
                    <Input
                      id="gate-state"
                      name="state"
                      maxLength={60}
                      autoComplete="address-level1"
                    />
                  </Field>
                  <Field label="PIN" htmlFor="gate-pin">
                    <Input
                      id="gate-pin"
                      name="pincode"
                      inputMode="numeric"
                      maxLength={6}
                      autoComplete="postal-code"
                    />
                  </Field>
                </div>

                <Field
                  label="Eshopbox pickup code (optional)"
                  htmlFor="gate-pickup"
                  hint="Only if your warehouse is already registered in Eshopbox. Leave blank and we'll send the address above instead."
                >
                  <Input
                    id="gate-pickup"
                    name="pickupLocationCode"
                    placeholder="e.g. WH-DEL-01"
                    maxLength={40}
                  />
                </Field>
              </div>
            </form>

            {/* Footer actions */}
            <div className="shrink-0 border-t border-border px-5 py-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
              {step === 1 ? (
                <button
                  type="button"
                  disabled={!step1Valid}
                  onClick={() => {
                    haptics.tap();
                    setStep(2);
                  }}
                  className="w-full rounded-full bg-primary py-3 text-sm font-semibold text-primary-foreground transition-all active:scale-[0.98] disabled:opacity-40"
                >
                  Next — shop location
                </button>
              ) : (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="rounded-full border border-border px-4 py-3 text-sm font-medium text-muted transition-colors hover:text-foreground"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    form="shop-address-gate-form"
                    disabled={pending}
                    className="flex-1 rounded-full bg-primary py-3 text-sm font-semibold text-primary-foreground transition-all active:scale-[0.98] disabled:opacity-50"
                  >
                    {pending ? (
                      <span className="inline-flex items-center gap-2">
                        <Spinner /> Saving…
                      </span>
                    ) : (
                      "Save & enable shipping"
                    )}
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
