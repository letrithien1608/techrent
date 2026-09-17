"use client";

import { cn } from "cn";
import { ChevronLeft, ChevronRight, Package } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { AnimatePresence, motion, type PanInfo } from "framer-motion";

const SWIPE_THRESHOLD = 60;

export function DeviceGallery({
  images,
  deviceName,
}: {
  images: string[];
  deviceName: string;
}) {
  const [[activeIndex, direction], setActive] = useState<[number, number]>([0, 0]);
  const activeImage = images[activeIndex];
  const canNavigate = images.length > 1;

  function goTo(nextIndex: number) {
    if (!canNavigate) return;
    const wrapped = (nextIndex + images.length) % images.length;
    setActive([wrapped, wrapped > activeIndex ? 1 : -1]);
  }

  function handleDragEnd(_: unknown, info: PanInfo) {
    if (info.offset.x < -SWIPE_THRESHOLD) goTo(activeIndex + 1);
    else if (info.offset.x > SWIPE_THRESHOLD) goTo(activeIndex - 1);
  }

  return (
    <div>
      <div className="group relative aspect-square w-full overflow-hidden rounded-2xl border border-border/60 bg-muted">
        <AnimatePresence initial={false} mode="wait">
          {activeImage ? (
            <motion.div
              key={activeImage}
              initial={{ opacity: 0, x: direction === 0 ? 0 : direction > 0 ? 80 : -80 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: direction > 0 ? -80 : 80 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              drag={canNavigate ? "x" : false}
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.6}
              onDragEnd={handleDragEnd}
              className="absolute inset-0 cursor-grab active:cursor-grabbing"
            >
              <Image
                src={activeImage}
                alt={deviceName}
                fill
                priority
                sizes="(min-width: 1024px) 55vw, 100vw"
                className="pointer-events-none object-cover"
                draggable={false}
              />
            </motion.div>
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
              <Package className="size-16" />
            </div>
          )}
        </AnimatePresence>

        {canNavigate && (
          <>
            <button
              type="button"
              onClick={() => goTo(activeIndex - 1)}
              aria-label="Ảnh trước"
              className="absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white opacity-0 backdrop-blur transition-opacity group-hover:opacity-100 hover:bg-black/60"
            >
              <ChevronLeft className="size-5" />
            </button>
            <button
              type="button"
              onClick={() => goTo(activeIndex + 1)}
              aria-label="Ảnh sau"
              className="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white opacity-0 backdrop-blur transition-opacity group-hover:opacity-100 hover:bg-black/60"
            >
              <ChevronRight className="size-5" />
            </button>

            <div className="absolute inset-x-0 bottom-3 z-10 flex items-center justify-center gap-1.5">
              {images.map((src, index) => (
                <button
                  key={src}
                  type="button"
                  onClick={() => setActive([index, index > activeIndex ? 1 : -1])}
                  aria-label={`Xem ảnh ${index + 1}`}
                  className={cn(
                    "h-1.5 rounded-full bg-white/50 backdrop-blur transition-all",
                    index === activeIndex ? "w-6 bg-white" : "w-1.5 hover:bg-white/80",
                  )}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {canNavigate && (
        <div className="mt-4 flex gap-3 overflow-x-auto pb-1">
          {images.map((src, index) => (
            <button
              key={src}
              type="button"
              onClick={() => setActive([index, index > activeIndex ? 1 : -1])}
              aria-label={`Xem ảnh ${index + 1}`}
              className={cn(
                "relative aspect-square w-20 shrink-0 overflow-hidden rounded-xl border-2 transition-all",
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
