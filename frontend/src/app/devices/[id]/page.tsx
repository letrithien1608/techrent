import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DeviceBookingPanel } from "@/components/devices/device-booking-panel";
import { DeviceGallery } from "@/components/devices/device-gallery";
import { DeviceReviews } from "@/components/devices/device-reviews";
import { DeviceSpecs } from "@/components/devices/device-specs";
import { RelatedDevices } from "@/components/devices/related-devices";
import { fetchDevice, fetchDevices, fetchReviews } from "@/lib/devices-api";

interface PageParams {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { id } = await params;
  const device = await fetchDevice(id);
  if (!device) {
    return { title: "Không tìm thấy thiết bị | TechRent" };
  }
  return {
    title: `${device.name} | TechRent`,
    description: `Thuê ${device.name} tại TechRent — ${device.category.name}, giao nhận nhanh chóng, hoàn cọc minh bạch.`,
  };
}

export default async function DeviceDetailPage({ params }: PageParams) {
  const { id } = await params;
  const device = await fetchDevice(id);
  if (!device) {
    notFound();
  }

  const [{ result: reviewsResult }, { result: relatedResult }] = await Promise.all([
    fetchReviews(device.id, { limit: 50 }),
    fetchDevices({ categoryId: device.categoryId, limit: 5 }),
  ]);

  const reviews = reviewsResult?.data ?? [];
  const reviewCount = reviews.length;
  const avgRating =
    reviewCount > 0
      ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviewCount
      : 0;

  const relatedDevices = (relatedResult?.data ?? [])
    .filter((item) => item.id !== device.id)
    .slice(0, 4);

  return (
    <div className="flex flex-1 flex-col pb-24 lg:pb-0">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1.1fr_0.9fr]">
          <DeviceGallery images={device.images} deviceName={device.name} />
          <DeviceBookingPanel
            device={device}
            avgRating={avgRating}
            reviewCount={reviewCount}
          />
        </div>

        <div className="mt-16 space-y-16">
          <DeviceSpecs specs={device.specs} />
          <DeviceReviews
            reviews={reviews}
            avgRating={avgRating}
            reviewCount={reviewCount}
          />
          <RelatedDevices devices={relatedDevices} />
        </div>
      </div>
    </div>
  );
}
