type SectionIntroProps = {
  eyebrow: string;
  title: string;
  description: string;
  as?: "h1" | "h2";
};

export function SectionIntro({
  eyebrow,
  title,
  description,
  as = "h2",
}: SectionIntroProps) {
  const HeadingTag = as;

  return (
    <div className="max-w-3xl">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[color:var(--accent)]">
        {eyebrow}
      </p>
      <HeadingTag className="mt-4 text-3xl font-semibold tracking-tight md:text-4xl">
        {title}
      </HeadingTag>
      <p className="mt-4 text-base leading-7 text-[color:var(--muted-foreground)]">
        {description}
      </p>
    </div>
  );
}
