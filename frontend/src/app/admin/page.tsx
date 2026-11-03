"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlarmClock,
  Banknote,
  Boxes,
  DollarSign,
  Package,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  WifiOff,
  Wrench,
} from "lucide-react";
import { cn } from "cn";
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
import { fetchBookings, fetchFinancialStats, type Booking } from "@/lib/bookings-api";
import { fetchDevices } from "@/lib/devices-api";
import { BOOKING_STATUS_LABEL } from "@/lib/booking-format";
import { formatDateTimeVi, formatVnd } from "@/lib/device-format";

// Tổng tiền (thuê, phí trễ hạn, phí hư hỏng, cọc đang giữ) lấy từ
// GET /bookings/stats (SQL trên toàn bộ đơn). Biểu đồ + xu hướng dựa trên
// tiền thuê đã thu theo ngày thu, tính từ 100 đơn gần nhất.
const CHART_DAYS = 14;
// Giới hạn tối đa 1 lần gọi API cho phép (ràng buộc `@Max(100)` ở backend) —
// đủ cho quy mô dữ liệu demo hiện tại (25 thiết bị), xem giới hạn đã ghi ở CLAUDE.md.
const STATS_FETCH_LIMIT = 100;

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
  trendPercent,
}: {
  icon: typeof DollarSign;
  label: string;
  value: string;
  tone: string;
  /** % thay đổi thật so với kỳ trước — chỉ truyền khi có dữ liệu kỳ trước để so sánh, KHÔNG bịa. */
  trendPercent?: number;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/50 p-5 transition-colors hover:border-border">
      <div className="flex items-start justify-between">
        <div
          className={cn(
            "inline-flex size-10 items-center justify-center rounded-xl",
            tone,
          )}
        >
          <Icon className="size-5" />
        </div>
        {trendPercent !== undefined && (
          <span
            title="So với 7 ngày trước đó"
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-medium",
              trendPercent >= 0
                ? "bg-emerald-500/15 text-emerald-400"
                : "bg-destructive/15 text-destructive",
            )}
          >
            {trendPercent >= 0 ? (
              <TrendingUp className="size-3" />
            ) : (
              <TrendingDown className="size-3" />
            )}
            {Math.abs(trendPercent).toFixed(0)}%
          </span>
        )}
      </div>
      <p className="mt-3 font-heading text-3xl font-extrabold tracking-tight">
        {value}
      </p>
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

function dayKey(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toISOString().slice(0, 10);
}

function formatChartLabel(key: string): string {
  const date = new Date(key);
  return date.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
}

function buildRevenueChart(bookings: Booking[]) {
  const buckets = new Map<string, number>();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = CHART_DAYS - 1; i >= 0; i -= 1) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    buckets.set(dayKey(date), 0);
  }

  for (const booking of bookings) {
    if (!booking.rentalPaid || !booking.rentalPaidAt) continue;
    const key = dayKey(booking.rentalPaidAt);
    if (!buckets.has(key)) continue;
    buckets.set(key, (buckets.get(key) ?? 0) + Number(booking.totalPrice));
  }

  return Array.from(buckets.entries()).map(([key, revenue]) => ({
    date: formatChartLabel(key),
    revenue,
  }));
}

function buildTopDevices(bookings: Booking[]) {
  const counts = new Map<string, { name: string; image?: string; count: number }>();
  for (const booking of bookings) {
    if (!booking.device) continue;
    const current = counts.get(booking.deviceId);
    if (current) {
      current.count += 1;
    } else {
      counts.set(booking.deviceId, {
        name: booking.device.name,
        image: booking.device.images?.[0],
        count: 1,
      });
    }
  }
  return Array.from(counts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

export default function AdminDashboardPage() {
  const devicesQuery = useQuery({
    queryKey: ["admin", "devices", "stats"],
    queryFn: () => fetchDevices({ limit: STATS_FETCH_LIMIT, includeDiscontinued: true }),
  });

  const bookingsQuery = useQuery({
    queryKey: ["admin", "bookings", "stats"],
    queryFn: () => fetchBookings({ limit: STATS_FETCH_LIMIT }),
  });

  const financeQuery = useQuery({
    queryKey: ["admin", "bookings", "financial-stats"],
    queryFn: fetchFinancialStats,
  });

  const isPending = devicesQuery.isPending || bookingsQuery.isPending || financeQuery.isPending;
  const isError =
    devicesQuery.isError ||
    bookingsQuery.isError ||
    financeQuery.isError ||
    devicesQuery.data?.hasError;

  const devicesData = devicesQuery.data?.result?.data;
  const bookingsData = bookingsQuery.data?.data;
  const devices = useMemo(() => devicesData ?? [], [devicesData]);
  const bookings = useMemo(() => bookingsData ?? [], [bookingsData]);

  const stats = useMemo(() => {
    const processing = bookings.filter(
      (b) => b.status === "pending" || b.status === "confirmed",
    ).length;
    const rented = devices.filter((d) => d.status === "rented").length;
    const maintenance = devices.filter((d) => d.status === "maintenance").length;

    // Chỉ báo xu hướng doanh thu — tính THẬT từ dữ liệu booking đã fetch (7
    // ngày gần nhất so với 7 ngày trước đó), KHÔNG bịa số liệu. `undefined`
    // khi kỳ trước = 0 (không có mẫu số hợp lệ để tính %).
    const now = new Date().getTime();
    const DAY_MS = 24 * 60 * 60 * 1000;
    let last7 = 0;
    let prev7 = 0;
    for (const b of bookings) {
      if (!b.rentalPaid || !b.rentalPaidAt) continue;
      const ageDays = (now - new Date(b.rentalPaidAt).getTime()) / DAY_MS;
      if (ageDays < 0) continue;
      if (ageDays <= 7) last7 += Number(b.totalPrice);
      else if (ageDays <= 14) prev7 += Number(b.totalPrice);
    }
    const revenueTrend = prev7 > 0 ? ((last7 - prev7) / prev7) * 100 : undefined;

    return { processing, rented, maintenance, revenueTrend };
  }, [bookings, devices]);

  const chartData = useMemo(() => buildRevenueChart(bookings), [bookings]);
  const topDevices = useMemo(() => buildTopDevices(bookings), [bookings]);
  const recentBookings = useMemo(
    () =>
      [...bookings]
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        )
        .slice(0, 5),
    [bookings],
  );

  if (isPending) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border/60 py-20 text-center">
        <WifiOff className="size-10 text-muted-foreground/50" />
        <p className="text-muted-foreground">
          Không thể tải dữ liệu tổng quan lúc này.
        </p>
        <Button
          onClick={() => {
            devicesQuery.refetch();
            bookingsQuery.refetch();
            financeQuery.refetch();
          }}
        >
          Thử lại
        </Button>
      </div>
    );
  }

  const finance = financeQuery.data!;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={DollarSign}
          label="Tiền thuê đã thu"
          value={formatVnd(finance.rentalRevenue)}
          tone="bg-emerald-500/15 text-emerald-400"
          trendPercent={stats.revenueTrend}
        />
        <StatCard
          icon={AlarmClock}
          label="Phí trễ hạn đã khấu trừ"
          value={formatVnd(finance.lateFees)}
          tone="bg-orange-500/15 text-orange-400"
        />
        <StatCard
          icon={Wrench}
          label="Phí hư hỏng đã khấu trừ"
          value={formatVnd(finance.damageFees)}
          tone="bg-red-500/15 text-red-300"
        />
        <StatCard
          icon={ShieldCheck}
          label="Tiền cọc đang giữ"
          value={formatVnd(finance.depositHeld)}
          tone="bg-violet-500/15 text-violet-300"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link href="/admin/refunds" className="block rounded-2xl focus-visible:outline-2 focus-visible:outline-primary">
          <StatCard
            icon={Banknote}
            label={
              finance.overdueRefundCount > 0
                ? `Chờ hoàn cọc · ${finance.overdueRefundCount} quá hạn`
                : "Khoản cọc chờ hoàn"
            }
            value={String(finance.pendingRefundCount)}
            tone={
              finance.overdueRefundCount > 0
                ? "bg-destructive/15 text-destructive"
                : "bg-amber-500/15 text-amber-400"
            }
          />
        </Link>
        <StatCard
          icon={Boxes}
          label="Đơn đang xử lý"
          value={String(stats.processing)}
          tone="bg-amber-500/15 text-amber-400"
        />
        <StatCard
          icon={Package}
          label="Thiết bị đang cho thuê"
          value={String(stats.rented)}
          tone="bg-cyan-500/15 text-cyan-400"
        />
        <StatCard
          icon={Package}
          label="Thiết bị cần bảo trì"
          value={String(stats.maintenance)}
          tone="bg-destructive/15 text-destructive"
        />
      </div>

      <div className="rounded-2xl border border-border/60 bg-card/50 p-5">
        <h2 className="font-heading text-base font-semibold">
          Tiền thuê đã thu {CHART_DAYS} ngày gần nhất
        </h2>
        <p className="text-sm text-muted-foreground">
          Theo ngày thu tiền thuê tại quầy (không gồm tiền cọc).
        </p>
        <div className="mt-4 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="date"
                stroke="var(--muted-foreground)"
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="var(--muted-foreground)"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                width={40}
              />
              <Tooltip
                formatter={(value) => formatVnd(Number(value))}
                cursor={{ fill: "var(--primary)", opacity: 0.08 }}
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  boxShadow: "0 4px 16px -4px rgb(0 0 0 / 0.2)",
                  color: "var(--popover-foreground)",
                  fontSize: 12,
                  padding: "8px 12px",
                }}
                labelStyle={{ color: "var(--muted-foreground)", marginBottom: 2 }}
              />
              <Bar
                dataKey="revenue"
                fill="var(--primary)"
                radius={[4, 4, 0, 0]}
                maxBarSize={28}
                activeBar={{ fill: "var(--primary)", fillOpacity: 0.85 }}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-border/60 bg-card/50 p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-heading text-base font-semibold">
              Đơn thuê gần đây
            </h2>
            <Button
              variant="ghost"
              size="sm"
              nativeButton={false}
              render={<Link href="/admin/bookings" />}
            >
              Xem tất cả
            </Button>
          </div>
          {recentBookings.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              Chưa có đơn thuê nào.
            </p>
          ) : (
            <Table className="mt-3">
              <TableHeader>
                <TableRow>
                  <TableHead>Thiết bị</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead className="text-right">Giá trị</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentBookings.map((booking) => {
                  const status = BOOKING_STATUS_LABEL[booking.status];
                  return (
                    <TableRow key={booking.id}>
                      <TableCell>
                        <div className="max-w-[160px] truncate font-medium">
                          {booking.device?.name ?? "Thiết bị"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatDateTimeVi(booking.createdAt)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs font-medium",
                            status.className,
                          )}
                        >
                          {status.label}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        {formatVnd(booking.totalPrice)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>

        <div className="rounded-2xl border border-border/60 bg-card/50 p-5">
          <h2 className="font-heading text-base font-semibold">
            Thiết bị được thuê nhiều nhất
          </h2>
          {topDevices.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              Chưa có dữ liệu.
            </p>
          ) : (
            <ul className="mt-3 space-y-1">
              {topDevices.map((device, index) => (
                <li
                  key={index}
                  className="flex items-center gap-3 rounded-lg px-1.5 py-1.5 text-sm transition-colors hover:bg-muted/40"
                >
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                    {index + 1}
                  </span>
                  <div className="relative size-8 shrink-0 overflow-hidden rounded-lg bg-muted">
                    {device.image ? (
                      <Image
                        src={device.image}
                        alt={device.name}
                        fill
                        sizes="32px"
                        className="object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                        <Package className="size-3.5" />
                      </div>
                    )}
                  </div>
                  <span className="min-w-0 flex-1 truncate">{device.name}</span>
                  <span className="shrink-0 font-medium text-muted-foreground">
                    {device.count} lượt thuê
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
