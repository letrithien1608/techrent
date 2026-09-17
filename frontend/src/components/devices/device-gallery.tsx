"use client";

import { cn } from "cn";
import { Package } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

export function DeviceGallery({
  images,
  deviceName,
}: {
  images: string[];
  deviceName: string;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeImage = images[activeIndex];

  return (
    <div>
      <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-muted">
        <AnimatePresence mode="wait" initial={false}>
          {activeImage ? (
            <motion.div
              key={activeImage}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="absolute inset-0"
            >
              <Image
                src={activeImage}
                alt={deviceName}
                fill
                priority
                sizes="(min-width: 1024px) 55vw, 100vw"
                className="object-cover"
              />
            </motion.div>
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
              <Package className="size-16" />
            </div>
          )}
        </AnimatePresence>
      </div>

      {images.length > 1 && (
        <div className="mt-4 flex gap-3 overflow-x-auto pb-1">
          {images.map((src, index) => (
            <button
              key={src}
              type="button"
              onClick={() => setActiveIndex(index)}
              aria-label={`Xem ảnh ${index + 1}`}
              className={cn(
                "relative aspect-square w-20 shrink-0 overflow-hidden rounded-xl border-2 transition-colors",
                index === activeIndex
                  ? "border-primary"
                  : "border-transparent opacity-70 hover:border-border hover:opacity-100",
              )}
            >
              <Image
                src={src}
                alt={`${deviceName} — ảnh ${index + 1}`}
                fill
                sizes="80px"
                className="object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
