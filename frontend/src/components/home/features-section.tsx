"use client";

import { cn } from "cn";
import { motion } from "framer-motion";
import { Headphones, Package, ShieldCheck, Zap } from "lucide-react";

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1 } },
};

const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

function ProgressPulse() {
  return (
    <div className="mt-5 h-1.5 w-full max-w-[220px] overflow-hidden rounded-full bg-white/10">
      <motion.div
        className="h-full rounded-full bg-gradient-to-r from-primary to-cyan-300"
        animate={{ width: ["8%", "92%", "8%"] }}
        transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}

export function FeaturesSection() {
  return (
    <section className="relative py-16 sm:py-24">
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
          className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 lg:grid-rows-2"
        >
          {/* Card lớn: chiếm 2 cột x 2 hàng, có mini progress bar animate */}
          <motion.div
            variants={item}
            className="group relative overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-br from-cyan-500/[0.07] via-card/60 to-card/60 p-7 transition-all duration-300 hover:-translate-y-1 hover:border-primary/50 hover:shadow-xl hover:shadow-primary/10 sm:col-span-2 lg:col-span-2 lg:row-span-2 lg:p-8"
          >
            <div className="mb-5 inline-flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Zap className="size-7" />
            </div>
            <h3 className="font-heading text-xl font-semibold">
              Đặt thuê nhanh chóng
            </h3>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">
              Chỉ mất vài phút để đặt thuê, xác nhận và thanh toán trực
              tuyến — từ lúc chọn thiết bị đến lúc có đơn xác nhận, mọi
              bước đều được tối ưu để nhanh nhất có thể.
            </p>
            <ProgressPulse />
            <p className="mt-2 text-xs text-muted-foreground/70">
              Thời gian đặt thuê trung bình: dưới 3 phút
            </p>
          </motion.div>

          <motion.div
            variants={item}
            className="group relative overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-br from-violet-500/[0.07] via-card/60 to-card/60 p-6 transition-all duration-300 hover:-translate-y-1 hover:border-primary/50 hover:shadow-xl hover:shadow-primary/10 sm:col-span-2 lg:col-span-2"
          >
            <div className="mb-4 inline-flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <motion.span
                animate={{ scale: [1, 1.15, 1] }}
                transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
              >
                <ShieldCheck className="size-5" />
              </motion.span>
            </div>
            <h3 className="font-heading font-semibold">
              An toàn & đáng tin cậy
            </h3>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Thiết bị được kiểm định kỹ trước khi bàn giao, chính sách hoàn
              cọc rõ ràng theo từng mốc thời gian huỷ.
            </p>
          </motion.div>

          <FeatureCard
            icon={Package}
            title="Đa dạng thiết bị"
            desc="Laptop, máy ảnh, flycam, âm thanh, gaming — đầy đủ mọi nhu cầu công nghệ."
            className="lg:col-span-1"
          />
          <FeatureCard
            icon={Headphones}
            title="Hỗ trợ 24/7"
            desc="Đội ngũ hỗ trợ luôn sẵn sàng giải đáp và xử lý sự cố mọi lúc."
            className="lg:col-span-1"
          />
        </motion.div>
      </div>
    </section>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  desc,
  className,
}: {
  icon: typeof Package;
  title: string;
  desc: string;
  className?: string;
}) {
  return (
    <motion.div
      variants={item}
      className={cn(
        "group rounded-3xl border border-border/60 bg-gradient-to-br from-cyan-500/[0.05] via-card/60 to-card/60 p-6 transition-all duration-300 hover:-translate-y-1 hover:border-primary/50 hover:shadow-xl hover:shadow-primary/10",
        className,
      )}
    >
      <div className="mb-4 inline-flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="size-5" />
      </div>
      <h3 className="font-heading font-semibold">{title}</h3>
      <p className="mt-1.5 text-sm text-muted-foreground">{desc}</p>
    </motion.div>
  );
}
