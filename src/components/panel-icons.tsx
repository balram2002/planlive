/** Small stroke icons shared by the seller/admin panel navs. */

function base(props: { d: string; extra?: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden>
      <path
        d={props.d}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {props.extra}
    </svg>
  );
}

export const IconHome = () =>
  base({ d: "M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1v-8.5Z" });

export const IconChart = () =>
  base({ d: "M4 19V5m0 14h16M8 16v-5m4 5V8m4 8v-3" });

export const IconBroadcast = () =>
  base({
    d: "M5 9a7 7 0 0 1 14 0M7.5 11.5a4.5 4.5 0 0 1 9 0",
    extra: <circle cx="12" cy="15" r="2" fill="currentColor" />,
  });

export const IconBag = () =>
  base({ d: "M5 8h14l-1 11a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 8Zm4 0a3 3 0 0 1 6 0" });

export const IconReceipt = () =>
  base({ d: "M6 3h12v18l-2-1.5L14 21l-2-1.5L10 21l-2-1.5L6 21V3Zm3 5h6M9 12h6M9 16h3" });

export const IconUsers = () =>
  base({
    d: "M16 19v-1a4 4 0 0 0-8 0v1M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7 8v-1a4 4 0 0 0-3-3.85M15 5.15A3 3 0 0 1 15 11",
  });

export const IconBox = () =>
  base({ d: "M4 8 12 4l8 4v8l-8 4-8-4V8Zm8 4 8-4M12 12 4 8m8 4v8" });

export const IconCalendar = () =>
  base({
    d: "M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Zm3-3v4m8-4v4M4 11h16",
  });

export const IconShield = () =>
  base({ d: "M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6l-7-3Zm-2.5 9 2 2 3.5-4" });

/** Delivery truck — shipments / courier. */
/** Wallet — seller earnings and balances. */
export const IconWallet = () =>
  base({
    d: "M3 8.5A2 2 0 0 1 5 6.5h12a2 2 0 0 1 2 2v1M3 8.5V17a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-2.5M3 8.5 16 4.2",
    extra: (
      <path
        d="M20 9.5h-3.5a2.5 2.5 0 0 0 0 5H20a1 1 0 0 0 1-1v-3a1 1 0 0 0-1-1Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
        fill="none"
      />
    ),
  });

/** Price tag — the seller's product catalogue. */
export const IconTag = () =>
  base({
    d: "M3.5 11.2V4.5a1 1 0 0 1 1-1h6.7a1 1 0 0 1 .7.3l8.1 8.1a1 1 0 0 1 0 1.4l-6.7 6.7a1 1 0 0 1-1.4 0L3.8 11.9a1 1 0 0 1-.3-.7Z",
    extra: (
      <circle cx="7.75" cy="7.75" r="1.25" fill="currentColor" />
    ),
  });

/** Map pin — serviceability / pincode coverage. */
export const IconPin = () =>
  base({
    d: "M12 21s7-5.3 7-11a7 7 0 1 0-14 0c0 5.7 7 11 7 11Z",
    extra: (
      <circle
        cx="12"
        cy="10"
        r="2.5"
        stroke="currentColor"
        strokeWidth="1.8"
        fill="none"
      />
    ),
  });

export const IconTruck = () =>
  base({
    d: "M3 7a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v9H3V7Zm11 3h3.5l2.5 3v3h-6v-6Z",
    extra: (
      <>
        <circle cx="7.5" cy="17.5" r="1.8" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="17" cy="17.5" r="1.8" stroke="currentColor" strokeWidth="1.8" />
      </>
    ),
  });
