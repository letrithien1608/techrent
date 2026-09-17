"use client";

import { motion } from "framer-motion";
import { specLabel } from "@/lib/device-format";

export function DeviceSpecs({
  specs,
}: {
  specs: Record<string, unknown> | null;
}) {
  const entries = specs ? Object.entries(specs) : [];
  if (entries.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.5 }}
    >
      <h2 className="font-heading text-2xl font-semibold tracking-tight">
        Thông số kỹ thuật
      </h2>
      <dl className="mt-4 divide-y divide-border/60">
        {entries.map(([key, value]) => (
          <div
            key={key}
            className="flex items-center justify-between gap-4 py-3 text-sm"
          >
            <dt className="text-muted-foreground">{specLabel(key)}</dt>
            <dd className="text-right font-medium text-foreground">
              {String(value)}
            </dd>
          </div>
        ))}
      </dl>
    </motion.div>
  );
}
