"use client";

import { cn } from "cn";
import { motion } from "framer-motion";
import { specLabel } from "@/lib/device-format";

export function DeviceSpecs({
  specs,
  detailedDescription,
}: {
  specs: Record<string, unknown> | null;
  detailedDescription?: string | null;
}) {
  const entries = specs ? Object.entries(specs) : [];
  if (entries.length === 0 && !detailedDescription) return null;

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

      {detailedDescription && (
        <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
          {detailedDescription}
        </p>
      )}

      {entries.length > 0 && (
        <dl className="mt-4 overflow-hidden rounded-2xl border border-border/60">
          {entries.map(([key, value], index) => (
            <div
              key={key}
              className={cn(
                "flex items-center justify-between gap-4 px-4 py-3.5 text-sm transition-colors hover:bg-muted/50",
                index % 2 === 1 && "bg-muted/20",
              )}
            >
              <dt className="text-muted-foreground">{specLabel(key)}</dt>
              <dd className="text-right font-medium text-foreground">
                {String(value)}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </motion.div>
  );
}
