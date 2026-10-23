"use client";

import { useId, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { cn } from "cn";
import type { SpecSheetEntry } from "@/lib/devices-api";
import { toSpecGroups, type SpecGroup } from "@/lib/spec-sheet";

export function DeviceSpecs({
  specSheet,
  specs,
  detailedDescription,
}: {
  specSheet?: SpecSheetEntry[] | null;
  specs: Record<string, unknown> | null;
  detailedDescription?: string | null;
}) {
  const groups = toSpecGroups(specSheet, specs);
  if (groups.length === 0 && !detailedDescription) return null;

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

      {groups.length > 0 && (
        <div className="mt-4 overflow-hidden rounded-2xl border border-border/60 divide-y divide-border/60">
          {groups.map((group) => (
            <SpecGroupSection key={group.group} group={group} />
          ))}
        </div>
      )}
    </motion.div>
  );
}

function SpecGroupSection({ group }: { group: SpecGroup }) {
  const [open, setOpen] = useState(true);
  const panelId = useId();

  return (
    <section>
      <h3>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex w-full items-center justify-between gap-3 bg-muted/30 px-4 py-3 text-left text-sm font-semibold text-foreground transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          <span>
            {group.group}
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {group.entries.length} thông số
            </span>
          </span>
          <ChevronDown
            className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
            aria-hidden
          />
        </button>
      </h3>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={panelId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <dl>
              {group.entries.map((entry, index) => (
                <div
                  key={entry.label}
                  className={cn(
                    "grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4 px-4 py-3 text-sm transition-colors hover:bg-muted/40",
                    index % 2 === 1 && "bg-muted/15",
                  )}
                >
                  <dt className="text-muted-foreground">{entry.label}</dt>
                  <dd className="text-right font-medium text-foreground break-words">
                    {entry.value}
                  </dd>
                </div>
              ))}
            </dl>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
