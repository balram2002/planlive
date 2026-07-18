export default function SearchLoading() {
  return (
    <div className="space-y-5 px-4 py-5">
      <div className="skeleton h-4 w-40" />
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton aspect-[3/4] rounded-2xl" />
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton h-9 w-28 rounded-full" />
        ))}
      </div>
    </div>
  );
}
