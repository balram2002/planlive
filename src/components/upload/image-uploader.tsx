"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "motion/react";
import { useToast } from "@/components/toast";
import { downscaleImage } from "@/lib/downscale-image";
import { haptics } from "@/lib/haptics";
import { cn } from "@/lib/cn";

type Kind = "avatar" | "thumbnail" | "category";

type UploadState =
  | { phase: "idle" }
  | {
      phase: "uploading";
      percent: number;
      etaLabel: string;
      speedLabel: string;
    }
  | { phase: "done" };

function formatEta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "…";
  if (seconds < 1) return "<1s left";
  if (seconds < 60) return `${Math.ceil(seconds)}s left`;
  const m = Math.floor(seconds / 60);
  const s = Math.ceil(seconds % 60);
  return `${m}m ${s}s left`;
}

/**
 * Direct-to-ImageKit image uploader with live progress (percent, speed,
 * precise time remaining), cancel and change controls. Images are downscaled
 * client-side first so uploads are fast and storage stays lean. Falls back to
 * the local /api/upload endpoint when ImageKit isn't configured.
 */
export function ImageUploader({
  kind,
  value,
  onChange,
  aspect = "square",
  label,
  maxWidth = 960,
}: {
  kind: Kind;
  value: string | null;
  onChange: (url: string | null) => void;
  aspect?: "square" | "portrait";
  label: string;
  maxWidth?: number;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [state, setState] = useState<UploadState>({ phase: "idle" });
  const { toast } = useToast();

  const shown = preview ?? value;

  function cancel() {
    haptics.tap();
    xhrRef.current?.abort();
    xhrRef.current = null;
    setState({ phase: "idle" });
    setPreview(null);
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;

    let blob: Blob;
    try {
      blob = await downscaleImage(file, maxWidth);
    } catch {
      toast({ title: "Couldn't read that image", variant: "error" });
      return;
    }

    const localUrl = URL.createObjectURL(blob);
    setPreview(localUrl);

    // Get upload credentials (or discover we're in local-fallback mode).
    let target:
      | { mode: "imagekit"; url: string; fields: Record<string, string> }
      | { mode: "local"; url: string };
    try {
      const authRes = await fetch(`/api/imagekit-auth?kind=${kind}`);
      if (authRes.ok) {
        const auth = await authRes.json();
        target = {
          mode: "imagekit",
          url: "https://upload.imagekit.io/api/v1/files/upload",
          fields: {
            publicKey: auth.publicKey,
            signature: auth.signature,
            expire: String(auth.expire),
            token: auth.token,
            folder: auth.folder,
            fileName: `${kind}.jpg`,
            useUniqueFileName: "true",
          },
        };
      } else if (authRes.status === 503) {
        target = { mode: "local", url: "/api/upload" };
      } else {
        const body = await authRes.json().catch(() => ({}));
        toast({ title: body.error ?? "Upload not allowed", variant: "error" });
        setPreview(null);
        return;
      }
    } catch {
      toast({ title: "Network error", variant: "error" });
      setPreview(null);
      return;
    }

    // XHR (fetch has no upload progress events).
    const form = new FormData();
    if (target.mode === "imagekit") {
      for (const [k, v] of Object.entries(target.fields)) form.append(k, v);
      form.append("file", blob, "upload.jpg");
    } else {
      form.append("file", blob, "upload.jpg");
    }

    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    const startedAt = Date.now();
    setState({ phase: "uploading", percent: 0, etaLabel: "…", speedLabel: "" });

    xhr.upload.onprogress = (ev) => {
      if (!ev.lengthComputable) return;
      const elapsed = (Date.now() - startedAt) / 1000;
      const speed = ev.loaded / Math.max(elapsed, 0.05); // bytes/s
      const remaining = (ev.total - ev.loaded) / Math.max(speed, 1);
      setState({
        phase: "uploading",
        percent: Math.round((ev.loaded / ev.total) * 100),
        etaLabel: formatEta(remaining),
        speedLabel:
          speed > 1024 * 1024
            ? `${(speed / (1024 * 1024)).toFixed(1)} MB/s`
            : `${Math.max(1, Math.round(speed / 1024))} KB/s`,
      });
    };

    xhr.onerror = () => {
      xhrRef.current = null;
      setState({ phase: "idle" });
      setPreview(null);
      toast({ title: "Upload failed", variant: "error" });
    };
    xhr.onabort = () => {
      xhrRef.current = null;
    };
    xhr.onload = () => {
      xhrRef.current = null;
      try {
        const res = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300 && res.url) {
          setState({ phase: "done" });
          onChange(res.url);
          haptics.success();
          return;
        }
        throw new Error(res.message ?? res.error ?? "Upload failed");
      } catch (err) {
        setState({ phase: "idle" });
        setPreview(null);
        toast({
          title: "Upload failed",
          description: err instanceof Error ? err.message : undefined,
          variant: "error",
        });
      }
    };

    xhr.open("POST", target.url);
    xhr.send(form);
  }

  const uploading = state.phase === "uploading";

  return (
    <div>
      <p className="mb-1.5 text-sm font-medium text-muted">{label}</p>
      <input
        ref={fileInput}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={onPick}
        className="hidden"
      />

      <div className="flex items-start gap-3">
        {/* Preview tile */}
        <button
          type="button"
          disabled={uploading}
          onClick={() => fileInput.current?.click()}
          className={cn(
            "relative block overflow-hidden border border-dashed border-border bg-surface-2 transition-all duration-200 hover:border-primary/50 active:scale-[0.98]",
            aspect === "square"
              ? "h-24 w-24 rounded-full"
              : "aspect-[3/4] w-28 rounded-2xl",
          )}
        >
          {shown ? (
            <Image
              src={shown}
              alt="Preview"
              fill
              unoptimized={shown.startsWith("blob:")}
              sizes="112px"
              className="object-cover"
            />
          ) : (
            <span className="flex h-full flex-col items-center justify-center gap-1 text-xs text-faint">
              <span className="text-xl">🖼️</span>
              Add
            </span>
          )}

          {/* Progress veil */}
          <AnimatePresence>
            {uploading ? (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 text-white"
              >
                <span className="text-sm font-bold tabular-nums">
                  {state.percent}%
                </span>
              </motion.span>
            ) : null}
          </AnimatePresence>
        </button>

        {/* Status + controls */}
        <div className="min-w-0 flex-1 pt-1">
          <AnimatePresence mode="wait" initial={false}>
            {uploading ? (
              <motion.div
                key="progress"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                  <motion.div
                    className="h-full rounded-full bg-primary"
                    animate={{ width: `${state.percent}%` }}
                    transition={{ ease: "easeOut", duration: 0.2 }}
                  />
                </div>
                <p className="mt-1.5 text-xs tabular-nums text-muted">
                  {state.percent}% · {state.etaLabel}
                  {state.speedLabel ? ` · ${state.speedLabel}` : ""}
                </p>
                <button
                  type="button"
                  onClick={cancel}
                  className="mt-1 text-xs font-medium text-live transition-opacity active:opacity-70"
                >
                  Cancel
                </button>
              </motion.div>
            ) : shown ? (
              <motion.div
                key="controls"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-3"
              >
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  className="text-xs font-medium text-primary transition-opacity active:opacity-70"
                >
                  Change
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPreview(null);
                    onChange(null);
                  }}
                  className="text-xs font-medium text-muted transition-colors hover:text-live"
                >
                  Remove
                </button>
              </motion.div>
            ) : (
              <motion.p
                key="hint"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-xs text-faint"
              >
                JPEG, PNG or WebP. Auto-optimized before upload.
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
