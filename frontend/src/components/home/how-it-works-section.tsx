"use client";

import { motion } from "framer-motion";
import { CreditCard, PackageCheck, Search, Star } from "lucide-react";

const steps = [
  {
    number: "01",
    icon: Search,
    title: "Tìm thiết bị",
    desc: "Duyệt danh sách, lọc theo danh mục hoặc tìm kiếm đúng thiết bị bạn cần.",
  },
  {
    number: "02",
    icon: CreditCard,
    title: "Đặt thuê & thanh toán",
    desc: "Chọn ngày giờ, xác nhận đơn và thanh toán tiền cọc trực tuyến qua VNPay.",
  },
  {
    number: "03",
    icon: PackageCheck,
    title: "Nhận thiết bị",
    desc: "Nhận thiết bị đúng hẹn, đã được kiểm tra kỹ lưỡng trước khi bàn giao.",
  },
  {
    number: "04",
    icon: Star,
    title: "Trả & đánh giá",
    desc: "Trả lại thiết bị, nhận hoàn cọc theo chính sách và để lại đánh giá.",
  },
];

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.15 } },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as const } },
};

export function HowItWorksSection() {
  return (
    <section className="relative py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
            Quy trình hoạt động
          </h2>
          <p className="mt-3 text-muted-foreground">
            Bốn bước đơn giản từ lúc tìm thiết bị đến khi hoàn tất thuê.
          </p>
        </div>

        <motion.div
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-80px" }}
          className="relative mt-14 grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6"
        >
          {/* Đường nối ngang giữa các bước — chỉ hiện trên desktop */}
          <div
            aria-hidden
            className="absolute left-0 right-0 top-8 hidden border-t-2 border-dashed border-border/60 lg:block"
          />

          {steps.map(({ number, icon: Icon, title, desc }) => (
            <motion.div key={number} variants={item} className="relative flex flex-col items-center text-center lg:items-start lg:text-left">
              <div className="relative z-10 flex size-16 items-center justify-center rounded-2xl border border-border/60 bg-background">
                <Icon className="size-6 text-primary" />
              </div>
              <span className="mt-4 font-heading text-4xl font-bold text-transparent [-webkit-text-stroke:1.5px_var(--border)]">
                {number}
              </span>
              <h3 className="mt-2 font-heading font-semibold">{title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
