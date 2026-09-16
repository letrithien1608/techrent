import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-24 text-center">
      <span className="rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">
        Nền tảng cho thuê thiết bị công nghệ
      </span>
      <h1 className="max-w-2xl text-balance font-heading text-4xl font-semibold tracking-tight sm:text-5xl">
        Thuê thiết bị công nghệ,{" "}
        <span className="text-primary">nhanh và đáng tin cậy</span>
      </h1>
      <p className="max-w-xl text-balance text-muted-foreground">
        Laptop, máy ảnh, flycam, thiết bị âm thanh và nhiều hơn nữa — đặt thuê
        chỉ trong vài phút. Trang danh sách thiết bị đang được hoàn thiện.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button size="lg" render={<Link href="/register" />}>
          Bắt đầu ngay
        </Button>
        <Button size="lg" variant="outline" render={<Link href="/login" />}>
          Tôi đã có tài khoản
        </Button>
      </div>
    </div>
  );
}
