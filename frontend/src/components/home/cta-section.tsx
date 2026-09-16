"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";

export function CtaSection() {
  return (
    <section className="px-4 py-20 sm:px-6 sm:py-28">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="relative mx-auto max-w-4xl overflow-hidden rounded-3xl bg-gradient-to-br from-cyan-600 via-cyan-700 to-violet-900 px-6 py-16 text-center sm:px-12"
      >
        <div aria-hidden className="hero-grid pointer-events-none absolute inset-0 opacity-30" />
        <h2 className="relative font-heading text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Sẵn sàng thuê thiết bị ngay hôm nay?
        </h2>
        <p className="relative mx-auto mt-3 max-w-xl text-cyan-50/90">
          Tạo tài khoản miễn phí và bắt đầu thuê thiết bị công nghệ chỉ trong
          vài phút.
        </p>
        <div className="relative mt-8">
          <Button
            size="lg"
            nativeButton={false}
            render={<Link href="/register" />}
            className="bg-white text-cyan-900 shadow-lg hover:bg-white/90 hover:scale-[1.02]"
          >
            Bắt đầu miễn phí
          </Button>
        </div>
      </motion.div>
    </section>
  );
}
