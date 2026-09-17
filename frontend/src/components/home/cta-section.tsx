"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";

export function CtaSection() {
  return (
    <section className="relative px-4 py-20 sm:px-6 sm:py-28">
      {/* Blob trang trí quanh viền ngoài khối CTA — không chỉ bên trong card */}
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[700px] w-[900px] -translate-x-1/2 -translate-y-1/2">
        <div className="absolute left-0 top-0 h-[350px] w-[350px] rounded-full bg-cyan-500/20 blur-[130px]" />
        <div className="absolute right-0 bottom-0 h-[350px] w-[350px] rounded-full bg-violet-600/20 blur-[130px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="relative mx-auto max-w-4xl rounded-[2rem] p-[2px]"
      >
        {/* Viền gradient xoay liên tục — khối conic-gradient lớn hơn hẳn container
            rồi bị cắt bởi overflow-hidden, chỉ lộ ra đúng viền mỏng 2px */}
        <div className="absolute inset-0 overflow-hidden rounded-[2rem]">
          <div
            aria-hidden
            className="animate-spin-slow absolute -inset-[150%] bg-[conic-gradient(from_0deg,transparent_0%,#22d3ee_18%,transparent_36%,#a78bfa_54%,transparent_72%,#22d3ee_90%,transparent_100%)]"
          />
        </div>

        <div className="relative overflow-hidden rounded-[calc(2rem-2px)] bg-gradient-to-br from-cyan-600 via-cyan-700 to-violet-900 px-6 py-20 text-center sm:px-16 sm:py-24">
          <div aria-hidden className="hero-grid pointer-events-none absolute inset-0 opacity-30" />
          <h2 className="relative text-balance font-heading text-4xl font-bold tracking-tight text-white sm:text-5xl">
            Sẵn sàng thuê thiết bị ngay hôm nay?
          </h2>
          <p className="relative mx-auto mt-4 max-w-xl text-lg text-cyan-50/90">
            Tạo tài khoản miễn phí và bắt đầu thuê thiết bị công nghệ chỉ trong
            vài phút.
          </p>
          <div className="relative mt-10">
            <Button
              size="lg"
              nativeButton={false}
              render={<Link href="/register" />}
              className="bg-white text-cyan-900 shadow-lg hover:bg-white/90 hover:scale-[1.02]"
            >
              Bắt đầu miễn phí
            </Button>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
