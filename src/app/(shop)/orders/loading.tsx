export default function OrdersLoading() {
  return (
    <div className="space-y-5 px-4 py-6">
      <div className="skeleton h-7 w-28" />
      <div className="space-y-2.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="skeleton h-[74px] rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
