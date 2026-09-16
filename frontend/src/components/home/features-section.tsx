"use client";

import { motion } from "framer-motion";
import { Headphones, Package, ShieldCheck, Zap } from "lucide-react";

const features = [
  {
    icon: Zap,
    title: "Đặt thuê nhanh chóng",
    desc: "Chỉ mất vài phút để đặt thuê, xác nhận và thanh toán trực tuyến.",
  },
  {
    icon: ShieldCheck,
    title: "An toàn & đáng tin cậy",
    desc: "Thiết bị được kiểm định kỹ trước khi bàn giao, chính sách hoàn cọc rõ ràng.",
  },
  {
    icon: Package,
    title: "Đa dạng thiết bị",
    desc: "Laptop, máy ảnh, flycam, âm thanh, gaming — đầy đủ mọi nhu cầu công nghệ.",
  },
  {
    icon: Headphones,
    title: "Hỗ trợ 24/7",
    desc: "Đội ngũ hỗ trợ luôn sẵn sàng giải đáp và xử lý sự cố mọi lúc.",
  },
];

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1 } },
};

const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

export function FeaturesSection() {
  return (
    <section className="py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
            Vì sao chọn TechRent
          </h2>
          <p className="mt-3 text-muted-foreground">
            Nền tảng cho thuê thiết bị công nghệ được xây dựng cho tốc độ, sự
            tin cậy và trải nghiệm mượt mà.
          </p>
        </div>

        <motion.div
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-80px" }}
          className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4"
        >
          {features.map(({ icon: Icon, title, desc }) => (
            <motion.div
              key={title}
              variants={item}
              className="group rounded-2xl border border-border/60 bg-card/50 p-6 transition-all duration-300 hover:-translate-y-1 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/10"
            >
              <div className="mb-4 inline-flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon className="size-5" />
              </div>
              <h3 className="font-heading font-semibold">{title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
