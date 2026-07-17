/**
 * Live-room shell: fullscreen, immersive — no top bar, no bottom nav.
 * The room itself renders its own header (host, LIVE, viewers, menu, close).
 */
export default function LiveLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-black">
      {children}
    </div>
  );
}
