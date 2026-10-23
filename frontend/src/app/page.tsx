import { CtaSection } from "@/components/home/cta-section";
import { FeaturedDevicesSection } from "@/components/home/featured-devices-section";
import { FeaturesSection } from "@/components/home/features-section";
import { HeroSection } from "@/components/home/hero-section";
import { HowItWorksSection } from "@/components/home/how-it-works-section";
import { SectionDivider } from "@/components/home/section-divider";
import { SiteBackground } from "@/components/home/site-background";
import { StatsSection } from "@/components/home/stats-section";
import { TestimonialsSection } from "@/components/home/testimonials-section";
import { fetchDevices, fetchFeaturedReviews } from "@/lib/devices-api";

export default async function Home() {
  const [{ result, hasError }, featuredReviews] = await Promise.all([
    fetchDevices({ limit: 6 }),
    fetchFeaturedReviews(),
  ]);
  const devices = result?.data ?? [];
  const totalDevices = result?.meta.total ?? 0;
  const deviceImages = devices
    .map((device) => device.images[0])
    .filter((src): src is string => Boolean(src));

  return (
    <div className="relative">
      <SiteBackground />

      <HeroSection totalDevices={totalDevices} deviceImages={deviceImages} />
      <FeaturesSection />
      <StatsSection totalDevices={totalDevices} />
      <HowItWorksSection />
      <SectionDivider />
      <FeaturedDevicesSection devices={devices} hasError={hasError} />
      <TestimonialsSection reviews={featuredReviews} />
      <SectionDivider />
      <CtaSection />
    </div>
  );
}
