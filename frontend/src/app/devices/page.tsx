import type { Metadata } from "next";
import { DevicesExplorer } from "@/components/devices/devices-explorer";
import { fetchCategories } from "@/lib/devices-api";

export const metadata: Metadata = {
  title: "Thiết bị | TechRent",
  description: "Danh sách thiết bị công nghệ có thể thuê tại TechRent",
};

export default async function DevicesPage() {
  const categories = await fetchCategories();

  return (
    <div className="flex flex-1 flex-col">
      <div className="mx-auto w-full max-w-6xl px-4 pt-10 sm:px-6">
        <h1 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
          Thiết bị
        </h1>
        <p className="mt-2 text-muted-foreground">
          Tìm đúng thiết bị công nghệ bạn cần, đặt thuê chỉ trong vài phút.
        </p>
      </div>
      <DevicesExplorer categories={categories} />
    </div>
  );
}
