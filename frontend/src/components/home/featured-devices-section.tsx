"use client";

import { cn } from "cn";
import Link from "next/link";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { DeviceCard } from "@/components/devices/device-card";
import type { Device } from "@/lib/devices-api";

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

export function FeaturedDevicesSection({
  devices,
  hasError,
}: {
  devices: Device[];
  hasError: boolean;
}) {
  const categories = useMemo(() => {
    const unique = new Map<string, string>();
    devices.forEach((device) => unique.set(device.category.id, device.category.name));
    return Array.from(unique, ([id, name]) => ({ id, name }));
  }, [devices]);

  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const visibleDevices = activeCategory
    ? devices.filter((device) => device.category.id === activeCategory)
    : devices;

  const marqueeItems = categories.length > 0 ? categories.map((c) => c.name) : ["Laptop", "Flycam", "Máy ảnh", "VR", "Âm thanh", "Mạng"];
  const marqueeLoop = [...marqueeItems, ...marqueeItems];

  return (
    <section className="relative py-16 sm:py-24">
      {/* Marquee danh mục chạy ngang — tạo cảm giác "đa dạng, nhiều lựa chọn" */}
      <div className="mb-10 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]">
        <div className="animate-marquee flex w-max items-center gap-8 text-sm font-medium uppercase tracking-wider text-muted-foreground/60">
          {marqueeLoop.map((name, index) => (
            <span key={`${name}-${index}`} className="flex items-center gap-8">
              {name}
              <span className="text-primary/50">•</span>
            </span>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
            Thiết bị nổi bật
          </h2>
          <p className="mt-3 text-muted-foreground">
            Một vài lựa chọn được quan tâm nhiều nhất gần đây.
          </p>
        </div>

        {categories.length > 1 && (
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => setActiveCategory(null)}
              className={cn(
                "shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                activeCategory === null
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground",
              )}
            >
              Tất cả
            </button>
            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => setActiveCategory(category.id)}
                className={cn(
                  "shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                  activeCategory === category.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground",
                )}
              >
                {category.name}
              </button>
            ))}
          </div>
        )}

        <div className="mt-10">
          {hasError ? (
            <div className="rounded-2xl border border-dashed border-border/60 py-16 text-center text-muted-foreground">
              Không thể tải danh sách thiết bị lúc này — vui lòng thử lại sau.
            </div>
          ) : visibleDevices.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/60 py-16 text-center text-muted-foreground">
              Chưa có thiết bị nào trong danh mục này.
            </div>
          ) : (
            <motion.div
              variants={container}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: "-80px" }}
              className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
            >
              {visibleDevices.map((device) => (
                <motion.div key={device.id} variants={item}>
                  <DeviceCard device={device} />
                </motion.div>
              ))}
            </motion.div>
          )}
        </div>

        <div className="mt-10 flex justify-center">
          <Button
            variant="outline"
            size="lg"
            nativeButton={false}
            render={<Link href="/devices" />}
          >
            Xem tất cả thiết bị →
          </Button>
        </div>
      </div>
    </section>
  );
}
