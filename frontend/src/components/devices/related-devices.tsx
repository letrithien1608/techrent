"use client";

import { motion } from "framer-motion";
import { DeviceCard } from "@/components/devices/device-card";
import type { Device } from "@/lib/devices-api";

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

export function RelatedDevices({ devices }: { devices: Device[] }) {
  if (devices.length === 0) return null;

  return (
    <div>
      <h2 className="font-heading text-2xl font-semibold tracking-tight">
        Có thể bạn cũng thích
      </h2>
      <motion.div
        variants={container}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-80px" }}
        className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4"
      >
        {devices.map((device) => (
          <motion.div key={device.id} variants={item}>
            <DeviceCard device={device} />
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}
