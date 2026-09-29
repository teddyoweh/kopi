import Link from "next/link";

/** The Kopi mark: a cup in the accent colour, and the name. */
export function Wordmark() {
  return (
    <Link href="/" className="flex items-center gap-2.5" aria-label="Kopi, overview">
      <svg viewBox="0 0 24 24" className="size-6" aria-hidden>
        <rect width="24" height="24" rx="8" className="fill-kopi" />
        <path d="M6.5 9h9v4.5a4 4 0 0 1-4 4h-1a4 4 0 0 1-4-4V9Z" fill="white" />
        <path d="M15.5 10.5h1.25a1.75 1.75 0 0 1 0 3.5H15.5" stroke="white" strokeWidth="1.5" fill="none" />
      </svg>
      <span className="text-[15px] font-medium tracking-tight">Kopi</span>
    </Link>
  );
}
