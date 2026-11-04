"use client";

import { cn } from "cn";
import Image from "next/image";
import Link from "next/link";
import type { MouseEvent } from "react";
import { motion, useMotionValue, useTransform, type MotionValue } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useSignedInCta } from "./use-signed-in-cta";

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

const MOCKUP_ROTATIONS = [-7, 5, -3];
const MOCKUP_POSITIONS = [
  "left-0 top-10 z-10",
  "left-[36%] top-0 z-20",
  "left-[16%] top-[200px] z-30",
];
const MOCKUP_DURATIONS = [4.6, 5.3, 4.9];
const MOCKUP_DELAYS = [0, 0.5, 1];

function HeroMockup({
  images,
  parallaxX,
  parallaxY,
}: {
  images: string[];
  parallaxX: MotionValue<number>;
  parallaxY: MotionValue<number>;
}) {
  const cards = images.slice(0, 3);
  if (cards.length === 0) return null;

  return (
    <motion.div
      style={{ x: parallaxX, y: parallaxY }}
      className="relative mx-auto h-[320px] w-[300px] sm:h-[420px] sm:w-[380px]"
    >
      {cards.map((src, index) => (
        <motion.div
          key={src}
          className={cn(
            "absolute h-[190px] w-[190px] overflow-hidden rounded-2xl border border-white/10 shadow-2xl shadow-black/50 sm:h-[250px] sm:w-[250px]",
            MOCKUP_POSITIONS[index],
          )}
          style={{ rotate: MOCKUP_ROTATIONS[index] }}
          animate={{ y: [0, -12, 0] }}
          transition={{
            duration: MOCKUP_DURATIONS[index],
            repeat: Infinity,
            ease: "easeInOut",
            delay: MOCKUP_DELAYS[index],
          }}
        >
          <Image src={src} alt="" fill sizes="250px" className="object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />
        </motion.div>
      ))}
    </motion.div>
  );
}

export function HeroSection({
  totalDevices,
  deviceImages,
}: {
  totalDevices: number;
  deviceImages: string[];
}) {
  const { loggedIn, secondary } = useSignedInCta();
  const badgeText =
    totalDevices > 0
      ? `Đang phục vụ ${totalDevices}+ thiết bị công nghệ`
      : "Nền tảng cho thuê thiết bị công nghệ";

  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const blobX = useTransform(mouseX, [-1, 1], [18, -18]);
  const blobY = useTransform(mouseY, [-1, 1], [18, -18]);
  const mockupX = useTransform(mouseX, [-1, 1], [-14, 14]);
  const mockupY = useTransform(mouseY, [-1, 1], [-14, 14]);

  function handleMouseMove(event: MouseEvent<HTMLElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    mouseX.set(((event.clientX - rect.left) / rect.width - 0.5) * 2);
    mouseY.set(((event.clientY - rect.top) / rect.height - 0.5) * 2);
  }

  return (
    <section
      onMouseMove={handleMouseMove}
      className="relative isolate overflow-hidden"
    >
      <div
        aria-hidden
        className="absolute inset-0 -z-20 bg-gradient-to-b from-background via-background to-[#0a0e18]"
      />
      <div aria-hidden className="hero-grid absolute inset-0 -z-10" />
      <motion.div aria-hidden style={{ x: blobX, y: blobY }} className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-[-15%] h-[520px] w-[640px] -translate-x-1/2 rounded-full bg-cyan-500/25 blur-[130px]" />
        <div className="absolute right-[8%] top-[8%] h-[380px] w-[380px] rounded-full bg-violet-600/20 blur-[120px]" />
      </motion.div>

      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-4 py-24 sm:py-32 lg:grid-cols-[1.1fr_0.9fr] lg:gap-6 lg:px-6 lg:py-36">
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="flex flex-col items-center gap-6 text-center lg:items-start lg:text-left"
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
            className="text-balance font-heading text-5xl font-bold tracking-tight sm:text-6xl lg:text-[4rem] lg:leading-[1.05]"
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
            className="flex flex-wrap items-center justify-center gap-3 pt-2 lg:justify-start"
          >
            {/* Đã đăng nhập thì không mời đăng ký/đăng nhập nữa — dẫn tới việc
                có ích tiếp theo. Trước khi đọc xong localStorage (hasHydrated)
                vẫn hiện nút khách để khớp HTML phía server. */}
            <Button
              size="lg"
              nativeButton={false}
              render={<Link href={loggedIn ? "/devices" : "/register"} />}
              className="shadow-lg shadow-primary/40 hover:scale-[1.02] hover:shadow-primary/60"
            >
              {loggedIn ? "Xem thiết bị" : "Bắt đầu ngay"}
            </Button>
            <Button
              size="lg"
              variant="outline"
              nativeButton={false}
              render={<Link href={loggedIn ? secondary.href : "/login"} />}
            >
              {loggedIn ? secondary.label : "Tôi đã có tài khoản"}
            </Button>
          </motion.div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="hidden lg:block"
        >
          <HeroMockup images={deviceImages} parallaxX={mockupX} parallaxY={mockupY} />
        </motion.div>
      </div>
    </section>
  );
}
