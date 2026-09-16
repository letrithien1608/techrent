"use client";

import { useEffect, useRef } from "react";
import { animate, useInView, useMotionValue } from "framer-motion";

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
  const stats: (CountUpNumberProps & { label: string })[] = [
    { value: totalDevices, suffix: "+", label: "Thiết bị sẵn sàng" },
    { value: 500, suffix: "+", label: "Lượt thuê thành công" },
    { value: 4.8, suffix: "/5", decimals: 1, label: "Đánh giá trung bình" },
    { value: 24, suffix: "/7", label: "Hỗ trợ khách hàng" },
  ];

  return (
    <section className="py-20 sm:py-28">
      <div className="mx-auto grid max-w-5xl grid-cols-2 gap-8 px-4 sm:grid-cols-4 sm:px-6">
        {stats.map(({ label, ...countProps }) => (
          <div key={label} className="text-center">
            <p className="font-heading text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
              <CountUpNumber {...countProps} />
            </p>
            <p className="mt-2 text-sm text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
