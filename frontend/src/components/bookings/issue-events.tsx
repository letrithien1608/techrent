import Image from "next/image";
import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import type { DeviceIssueReport } from "@/lib/bookings-api";
import { ISSUE_RESOLUTION_LABEL, isVideoUrl } from "@/lib/booking-format";
import { formatDateTimeVi, formatVnd } from "@/lib/device-format";

export function IssueMedia({ media }: { media: string[] }) {
  if (!media.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {media.map((src, i) =>
        isVideoUrl(src) ? (
          <video key={src} src={src} controls className="h-20 w-28 rounded-lg bg-black object-cover" />
        ) : (
          <a
            key={src}
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            className="relative size-20 overflow-hidden rounded-lg bg-muted"
          >
            <Image src={src} alt={`Ảnh báo lỗi ${i + 1}`} fill sizes="80px" className="object-cover" />
          </a>
        ),
      )}
    </div>
  );
}

function outcome(report: DeviceIssueReport): string {
  if (report.resolution === "ended_early") {
    return `Hoàn ${formatVnd(report.rentalRefundAmount)} tiền thuê phần chưa dùng + đủ tiền cọc.`;
  }
  if (report.resolution === "customer_fault") {
    return `Chi phí sửa ${formatVnd(report.repairCost)} trừ vào tiền cọc khi trả máy.`;
  }
  return "Đã đổi sang máy tương đương, thời hạn thuê giữ nguyên.";
}

/** Sự kiện báo lỗi / đổi máy của 1 đơn — hiện dưới dòng thời gian. */
export function IssueEvents({ reports }: { reports?: DeviceIssueReport[] }) {
  if (!reports?.length) return null;
  return (
    <ol className="space-y-3" aria-label="Báo lỗi thiết bị">
      {reports.map((report) => (
        <li key={report.id} className="rounded-xl border border-border/60 p-3 text-sm">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-400" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                Báo lỗi thiết bị
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {formatDateTimeVi(report.createdAt)}
                </span>
              </p>
              <p className="mt-0.5 text-muted-foreground">{report.description}</p>
              <IssueMedia media={report.media} />
            </div>
          </div>
          <div className="mt-2 flex items-start gap-2 border-t border-border/50 pt-2">
            {report.status === "resolved" && report.resolution ? (
              <>
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-400" aria-hidden />
                <div>
                  <p className="font-medium">
                    {ISSUE_RESOLUTION_LABEL[report.resolution]}
                    {report.resolvedAt && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        {formatDateTimeVi(report.resolvedAt)}
                      </span>
                    )}
                  </p>
                  <p className="text-muted-foreground">{outcome(report)}</p>
                  {report.resolutionNote && (
                    <p className="text-xs text-muted-foreground">Ghi chú: {report.resolutionNote}</p>
                  )}
                </div>
              </>
            ) : (
              <>
                <Clock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                <p className="text-muted-foreground">Cửa hàng đang kiểm tra và sẽ liên hệ bạn.</p>
              </>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
