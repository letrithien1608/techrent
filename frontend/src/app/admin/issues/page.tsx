"use client";

import { cn } from "cn";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { TriangleAlert, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { BookingDetailDialog } from "@/components/admin/booking-detail-dialog";
import { ResolveIssueDialog } from "@/components/admin/resolve-issue-dialog";
import { fetchIssueReports, type IssueReportWithBooking } from "@/lib/bookings-api";
import { ISSUE_RESOLUTION_LABEL } from "@/lib/booking-format";
import { formatDateTimeVi } from "@/lib/device-format";

const PAGE_SIZE = 20;
const TABS = [
  { value: "open", label: "Chờ xử lý" },
  { value: "resolved", label: "Đã xử lý" },
] as const;

export default function AdminIssuesPage() {
  return (
    <Suspense fallback={null}>
      <AdminIssuesContent />
    </Suspense>
  );
}

/** Báo lỗi thiết bị giữa kỳ thuê — chờ xử lý lên đầu (cũ nhất trước). */
function AdminIssuesContent() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const focusId = useSearchParams().get("reportId");
  const [tab, setTab] = useState<(typeof TABS)[number]["value"]>("open");
  const [page, setPage] = useState(1);
  const [active, setActive] = useState<IssueReportWithBooking | null>(null);

  const query = useQuery({
    queryKey: ["admin", "issues", tab, page],
    queryFn: () => fetchIssueReports({ status: tab, page, limit: PAGE_SIZE }),
  });
  const reports = query.data?.data ?? [];
  // Đi từ thông báo (`?reportId=`) → mở sẵn hộp thoại xử lý nếu báo lỗi còn chờ.
  const focused = focusId ? reports.find((r) => r.id === focusId && r.status === "open") : undefined;
  const dialogReport = active ?? focused ?? null;

  function handleResolved() {
    queryClient.invalidateQueries({ queryKey: ["admin"] });
  }

  return (
    <div className="space-y-4">
      {dialogReport && (
        <ResolveIssueDialog
          key={dialogReport.id}
          report={dialogReport}
          open
          onOpenChange={(open) => {
            if (!open) {
              setActive(null);
              if (focusId) router.replace("/admin/issues");
            }
          }}
          onResolved={handleResolved}
        />
      )}
      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/50">
        <div role="tablist" aria-label="Trạng thái báo lỗi" className="flex gap-1.5 border-b border-border/60 p-4">
          {TABS.map((item) => (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={tab === item.value}
              onClick={() => {
                setTab(item.value);
                setPage(1);
              }}
              className={cn(
                "rounded-full px-3 py-1 text-sm font-medium transition-colors",
                tab === item.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        {query.isPending ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        ) : query.isError ? (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <WifiOff className="size-10 text-muted-foreground/50" />
            <p className="text-muted-foreground">Không thể tải danh sách báo lỗi.</p>
            <Button onClick={() => query.refetch()}>Thử lại</Button>
          </div>
        ) : reports.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <TriangleAlert className="size-10 text-muted-foreground/40" />
            <p className="text-muted-foreground">
              {tab === "open" ? "Không có báo lỗi nào đang chờ xử lý." : "Chưa có báo lỗi nào."}
            </p>
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Khách / thiết bị</TableHead>
                  <TableHead>Mô tả lỗi</TableHead>
                  <TableHead>Gửi lúc</TableHead>
                  <TableHead>{tab === "open" ? "Hạn trả" : "Cách xử lý"}</TableHead>
                  <TableHead className="text-right">Hành động</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.map((report) => (
                  <TableRow key={report.id}>
                    <TableCell className="max-w-[200px]">
                      <p className="truncate font-medium">{report.booking.user?.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{report.booking.device?.name}</p>
                    </TableCell>
                    <TableCell className="max-w-[280px]">
                      <p className="line-clamp-2 text-sm">{report.description}</p>
                      {report.media.length > 0 && (
                        <p className="text-xs text-muted-foreground">{report.media.length} ảnh/video</p>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDateTimeVi(report.createdAt)}</TableCell>
                    <TableCell className="text-xs">
                      {tab === "open"
                        ? formatDateTimeVi(report.booking.endTime)
                        : report.resolution && ISSUE_RESOLUTION_LABEL[report.resolution]}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <BookingDetailDialog booking={report.booking} />
                        {report.status === "open" && (
                          <Button size="sm" onClick={() => setActive(report)}>
                            Xử lý
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <AdminPagination
              page={page}
              totalPages={query.data?.meta.totalPages ?? 1}
              onPageChange={setPage}
            />
          </>
        )}
      </div>
    </div>
  );
}
