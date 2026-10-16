import Link from "next/link";

type LogoProps = {
  /** "dark" = for light backgrounds, "light" = for navy backgrounds */
  tone?: "dark" | "light";
  href?: string;
  className?: string;
};

export function LogoMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <rect width="32" height="32" rx="8" fill="#4f46e5" />
      {/* Two ledgers meeting: the reconciliation idea, shaped as a T */}
      <rect x="7" y="8" width="18" height="4" rx="2" fill="#ffffff" />
      <rect x="14" y="12" width="4" height="13" rx="2" fill="#ffffff" />
      <path
        d="M19.5 20.5l2 2 4-4.5"
        fill="none"
        stroke="#a5b4fc"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Logo({ tone = "dark", href = "/", className = "" }: LogoProps) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-2.5 ${className}`}
      aria-label="Taxora home"
    >
      <LogoMark />
      <span
        className={`text-[1.15rem] font-semibold tracking-tight ${
          tone === "light" ? "text-white" : "text-navy-900"
        }`}
      >
        Taxora
      </span>
    </Link>
  );
}
