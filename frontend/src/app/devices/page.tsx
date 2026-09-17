import type { Metadata } from "next";
import { SiteBackground } from "@/components/home/site-background";
import { DevicesExplorer } from "@/components/devices/devices-explorer";
import { DevicesPageHeader } from "@/components/devices/devices-page-header";
import { fetchCategories, fetchDevices } from "@/lib/devices-api";

export const metadata: Metadata = {
  title: "Thiết bị | TechRent",
  description: "Danh sách thiết bị công nghệ có thể thuê tại TechRent",
};

export default async function DevicesPage() {
  const [categories, { result }] = await Promise.all([
    fetchCategories(),
    fetchDevices({ limit: 1 }),
  ]);
  const totalDevices = result?.meta.total ?? 0;

  return (
    <div className="relative flex flex-1 flex-col">
      <SiteBackground />
      <DevicesPageHeader totalDevices={totalDevices} />
      <DevicesExplorer categories={categories} />
    </div>
  );
}
