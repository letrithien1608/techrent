import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Nút "Quay lại" ở đầu các trang chi tiết trong khu quản trị. */
export function AdminBackButton({ href, label }: { href: string; label: string }) {
  return (
    <Button variant="ghost" className="-ml-2 mb-4 h-9 gap-1.5 px-2.5 text-muted-foreground hover:text-foreground" nativeButton={false} render={<Link href={href} />}>
      <ArrowLeft className="size-4" />
      {label}
    </Button>
  );
}
