import { CtaSection } from "@/components/home/cta-section";
import { FeaturedDevicesSection } from "@/components/home/featured-devices-section";
import { FeaturesSection } from "@/components/home/features-section";
import { HeroSection } from "@/components/home/hero-section";
import { SectionDivider } from "@/components/home/section-divider";
import { StatsSection } from "@/components/home/stats-section";
import { fetchDevices } from "@/lib/devices-api";

export default async function Home() {
  const { result, hasError } = await fetchDevices({ limit: 6 });
  const devices = result?.data ?? [];
  const totalDevices = result?.meta.total ?? 0;

  return (
    <>
      <HeroSection totalDevices={totalDevices} />
      <SectionDivider />
      <FeaturesSection />
      <SectionDivider />
      <StatsSection totalDevices={totalDevices} />
      <SectionDivider />
      <FeaturedDevicesSection devices={devices} hasError={hasError} />
      <CtaSection />
    </>
  );
}
