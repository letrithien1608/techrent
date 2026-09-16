import Link from "next/link";

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border/60 bg-background">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-2 font-heading font-semibold text-foreground">
          <span className="inline-flex size-6 items-center justify-center rounded-md bg-primary text-xs text-primary-foreground">
            T
          </span>
          Tech<span className="text-primary">Rent</span>
        </div>
        <p>© {year} TechRent — Nền tảng cho thuê thiết bị công nghệ.</p>
        <div className="flex items-center gap-4">
          <Link href="/" className="transition-colors hover:text-foreground">
            Trang chủ
          </Link>
        </div>
      </div>
    </footer>
  );
}
