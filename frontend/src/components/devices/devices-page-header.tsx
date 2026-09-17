"use client";

import { motion } from "framer-motion";

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as const },
  },
};

export function DevicesPageHeader({ totalDevices }: { totalDevices: number }) {
  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="mx-auto w-full max-w-6xl px-4 pt-14 pb-2 sm:px-6 sm:pt-20"
    >
      {totalDevices > 0 && (
        <motion.span
          variants={fadeUp}
          className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur"
        >
          <span className="relative flex size-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-primary" />
          </span>
          {totalDevices}+ thiết bị đang sẵn sàng
        </motion.span>
      )}

      <motion.h1
        variants={fadeUp}
        className="mt-4 font-heading text-4xl font-bold tracking-tight sm:text-5xl"
      >
        Thiết bị
      </motion.h1>
      <motion.p variants={fadeUp} className="mt-2 max-w-xl text-muted-foreground">
        Tìm đúng thiết bị công nghệ bạn cần, đặt thuê chỉ trong vài phút.
      </motion.p>
    </motion.div>
  );
}
