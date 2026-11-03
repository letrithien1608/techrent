import Image from "next/image";
import { cn } from "cn";
import type { BookingInspection } from "@/lib/bookings-api";
import { DEVICE_CONDITION_LABEL } from "@/lib/booking-format";
import { formatDateTimeVi } from "@/lib/device-format";

function InspectionColumn({
  title,
  inspection,
  emptyText,
}: {
  title: string;
  inspection?: BookingInspection;
  emptyText: string;
}) {
  return (
    <div className="min-w-0 space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="text-sm font-semibold">{title}</h4>
        {inspection && (
          <span className="text-xs text-muted-foreground">{formatDateTimeVi(inspection.createdAt)}</span>
        )}
      </div>
      {!inspection ? (
        <p className="rounded-xl border border-dashed border-border/60 px-3 py-6 text-center text-xs text-muted-foreground">
          {emptyText}
        </p>
      ) : (
        <>
          {inspection.images.length > 0 ? (
            <div className="grid grid-cols-3 gap-1.5">
              {inspection.images.map((src, i) => (
                <a
                  key={src}
                  href={src}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="relative aspect-square overflow-hidden rounded-lg bg-muted"
                >
                  <Image src={src} alt={`${title} – ảnh ${i + 1}`} fill sizes="120px" className="object-cover" />
                </a>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Không kèm ảnh.</p>
          )}
          {inspection.type === "return" && (
            <p className="text-xs">
              Tình trạng:{" "}
              <span
                className={cn(
                  "font-medium",
                  inspection.condition === "intact" ? "text-emerald-400" : "text-destructive",
                )}
              >
                {DEVICE_CONDITION_LABEL[inspection.condition]}
              </span>
              {inspection.damageDescription && ` — ${inspection.damageDescription}`}
            </p>
          )}
          {inspection.notes && <p className="text-xs text-muted-foreground">Ghi chú: {inspection.notes}</p>}
        </>
      )}
    </div>
  );
}

/** Ảnh tình trạng thiết bị lúc giao đặt cạnh ảnh lúc trả — căn cứ tính phí hư hỏng. */
export function InspectionComparison({
  inspections,
  endedWithoutReturn = false,
}: {
  inspections?: BookingInspection[];
  /** Đơn đã kết thúc mà không qua bước trả máy (kết thúc sớm do lỗi thiết bị). */
  endedWithoutReturn?: boolean;
}) {
  const handover = inspections?.find((i) => i.type === "handover");
  const returned = inspections?.find((i) => i.type === "return");
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <InspectionColumn title="Lúc giao máy" inspection={handover} emptyText="Chưa lập biên bản giao máy" />
      <InspectionColumn
        title="Lúc trả máy"
        inspection={returned}
        emptyText={endedWithoutReturn ? "Đơn kết thúc sớm do lỗi thiết bị — xem mục Báo lỗi" : "Chưa trả máy"}
      />
    </div>
  );
}
