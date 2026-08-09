import { cn } from "@/lib/utils";

export function UserAvatar({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <span
      className={cn(
        "inline-flex h-10 w-10 items-center justify-center rounded-full bg-[color:var(--accent)]/12 text-sm font-semibold text-[color:var(--accent)]",
        className,
      )}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}
