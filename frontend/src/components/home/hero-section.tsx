"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.13, delayChildren: 0.05 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] as const },
  },
};

export function HeroSection({ totalDevices }: { totalDevices: number }) {
  const badgeText =
    totalDevices > 0
      ? `Đang phục vụ ${totalDevices}+ thiết bị công nghệ`
      : "Nền tảng cho thuê thiết bị công nghệ";

  return (
    <section className="relative isolate overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0 -z-20 bg-gradient-to-b from-background via-background to-[#0a0e18]"
      />
      <div aria-hidden className="hero-grid absolute inset-0 -z-10" />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[-15%] -z-10 h-[520px] w-[640px] -translate-x-1/2 rounded-full bg-cyan-500/25 blur-[130px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute right-[8%] top-[8%] -z-10 h-[380px] w-[380px] rounded-full bg-violet-600/20 blur-[120px]"
      />

      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="mx-auto flex max-w-4xl flex-col items-center gap-6 px-4 py-28 text-center sm:py-36"
      >
        <motion.span
          variants={fadeUp}
          className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur"
        >
          <span className="relative flex size-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-primary" />
          </span>
          {badgeText}
        </motion.span>

        <motion.h1
          variants={fadeUp}
          className="text-balance font-heading text-5xl font-bold tracking-tight sm:text-6xl lg:text-[4.5rem] lg:leading-[1.05]"
        >
          Thuê thiết bị công nghệ{" "}
          <span className="bg-gradient-to-r from-primary via-cyan-300 to-violet-400 bg-clip-text text-transparent">
            nhanh, dễ, đáng tin cậy
          </span>
        </motion.h1>

        <motion.p
          variants={fadeUp}
          className="max-w-xl text-balance text-lg text-muted-foreground"
        >
          Laptop, máy ảnh, flycam, thiết bị âm thanh và nhiều hơn nữa — đặt
          thuê chỉ trong vài phút, giao nhận nhanh chóng, hoàn cọc minh bạch.
        </motion.p>

        <motion.div
          variants={fadeUp}
          className="flex flex-wrap items-center justify-center gap-3 pt-2"
        >
          <Button
            size="lg"
            nativeButton={false}
            render={<Link href="/register" />}
            className="shadow-lg shadow-primary/40 hover:scale-[1.02] hover:shadow-primary/60"
          >
            Bắt đầu ngay
          </Button>
          <Button
            size="lg"
            variant="outline"
            nativeButton={false}
            render={<Link href="/login" />}
          >
            Tôi đã có tài khoản
          </Button>
        </motion.div>
      </motion.div>
    </section>
  );
}
