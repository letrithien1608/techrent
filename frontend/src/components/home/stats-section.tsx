"use client";

import { useEffect, useRef } from "react";
import { animate, motion, useInView, useMotionValue } from "framer-motion";
import { Headphones, Package, Star, Users } from "lucide-react";

interface CountUpNumberProps {
  value: number;
  suffix: string;
  decimals?: number;
}

function CountUpNumber({ value, suffix, decimals = 0 }: CountUpNumberProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const motionValue = useMotionValue(0);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  useEffect(() => {
    if (!isInView) return;
    const controls = animate(motionValue, value, {
      duration: 1.6,
      ease: [0.16, 1, 0.3, 1],
    });
    return () => controls.stop();
  }, [isInView, motionValue, value]);

  useEffect(() => {
    return motionValue.on("change", (latest) => {
      if (ref.current) {
        ref.current.textContent = `${latest.toFixed(decimals)}${suffix}`;
      }
    });
  }, [motionValue, suffix, decimals]);

  return <span ref={ref}>{`${(0).toFixed(decimals)}${suffix}`}</span>;
}

export function StatsSection({ totalDevices }: { totalDevices: number }) {
  const stats: (CountUpNumberProps & { label: string; icon: typeof Package })[] = [
    { value: totalDevices, suffix: "+", label: "Thiết bị sẵn sàng", icon: Package },
    { value: 500, suffix: "+", label: "Lượt thuê thành công", icon: Users },
    { value: 4.8, suffix: "/5", decimals: 1, label: "Đánh giá trung bình", icon: Star },
    { value: 24, suffix: "/7", label: "Hỗ trợ khách hàng", icon: Headphones },
  ];

  return (
    <section className="relative py-16 sm:py-24">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 shadow-2xl shadow-black/20 backdrop-blur-xl sm:p-12"
        >
          <p className="text-center text-sm font-medium text-muted-foreground">
            Được tin dùng bởi hàng trăm khách hàng mỗi tháng
          </p>
          <div className="mt-8 grid grid-cols-2 gap-8 sm:grid-cols-4">
            {stats.map(({ label, icon: Icon, ...countProps }) => (
              <div key={label} className="text-center">
                <Icon className="mx-auto mb-2 size-5 text-primary" />
                <p className="font-heading text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
                  <CountUpNumber {...countProps} />
                </p>
                <p className="mt-2 text-sm text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
