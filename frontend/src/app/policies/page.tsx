import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  AlarmClock,
  CircleDollarSign,
  Clock4,
  FileSignature,
  RotateCcw,
  ShieldCheck,
  Store,
  Wallet,
  WifiOff,
  type LucideIcon,
} from "lucide-react";
import { SiteBackground } from "@/components/home/site-background";
import { Button } from "@/components/ui/button";
import { formatVnd } from "@/lib/device-format";
import { fetchRentalPolicy, type RentalPolicy } from "@/lib/policies-api";

export const metadata: Metadata = {
  title: "Chính sách thuê | TechRent",
  description:
    "Tiền cọc, tiền thuê tại quầy, hoàn cọc, phí trễ hạn và nhận/trả máy tại cửa hàng TechRent",
};

const pct = (ratio: number) => `${Math.round(ratio * 100)}%`;

function PolicyCard({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-xl sm:p-7">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-2xl bg-primary/15 text-primary">
          <Icon className="size-5" aria-hidden />
        </span>
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      </div>
      <div className="space-y-3 text-[15px] leading-relaxed text-foreground/85">
        {children}
      </div>
    </section>
  );
}

function ExampleTable({ rows }: { rows: [string, string][] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      {rows.map(([label, value], i) => (
        <div
          key={label}
          className={`flex items-center justify-between gap-4 px-4 py-2.5 text-sm ${i % 2 ? "bg-muted/20" : ""}`}
        >
          <span className="text-muted-foreground">{label}</span>
          <span className="font-semibold text-foreground">{value}</span>
        </div>
      ))}
    </div>
  );
}

function PolicyContent({ policy }: { policy: RentalPolicy }) {
  const [full, partial] = policy.refundTiers;
  const { examples } = policy;
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <PolicyCard icon={CircleDollarSign} title="Tiền đặt cọc">
        <p>
          Tiền cọc bằng{" "}
          <strong className="text-primary">{pct(policy.depositRatio)}</strong>{" "}
          giá trị tài sản (giá gốc) của thiết bị — không phụ thuộc bạn thuê 1
          giờ hay 1 tuần, vì rủi ro mất/hỏng thiết bị là như nhau.
        </p>
        <ExampleTable
          rows={[
            [
              "Giá trị thiết bị (ví dụ)",
              formatVnd(examples.deposit.originalPrice),
            ],
            ["Tiền cọc", formatVnd(examples.deposit.deposit)],
          ]}
        />
        <p className="text-sm text-muted-foreground">
          Thanh toán cọc online qua VNPay ngay sau khi đặt. Giá trị tài sản của
          từng máy hiển thị ở trang chi tiết thiết bị.
        </p>
      </PolicyCard>

      {/* 2 thẻ dưới dùng trường có từ 03/11 — bản cache cũ của API (revalidate 5 phút)
       * có thể chưa có, khi đó ẩn đi thay vì tự điền số (số chỉ lấy từ backend). */}
      {examples.settlement &&
        policy.depositRefundBusinessDays !== undefined && (
          <>
            <PolicyCard icon={Store} title="Nhận & trả máy tại cửa hàng">
              <p>
                TechRent{" "}
                <strong className="text-primary">
                  không giao hàng tận nơi
                </strong>
                . Bạn nhận và trả máy trực tiếp tại cửa hàng để nhân viên đối
                chiếu <strong>CCCD gốc</strong> và cùng bạn ký hợp đồng.
              </p>
              <p>
                Khi giao máy, nhân viên chụp tối thiểu{" "}
                {policy.handoverMinPhotos} ảnh tình trạng thiết bị và ghi chú
                phụ kiện kèm theo. Khi trả máy, ảnh lúc giao được đặt cạnh ảnh
                lúc trả để đối chiếu — đây là căn cứ tính phí hư hỏng (nếu có).
              </p>
            </PolicyCard>

            <PolicyCard
              icon={Wallet}
              title="Tiền thuê & quyết toán cọc khi trả máy"
            >
              <p>
                Tiền thuê thanh toán{" "}
                <strong className="text-primary">tại quầy khi nhận máy</strong>{" "}
                (tiền mặt hoặc chuyển khoản). Khi trả máy: tiền cọc hoàn lại =
                tiền cọc − phí trễ hạn − phí hư hỏng/thiếu phụ kiện. Nếu khoản
                trừ lớn hơn tiền cọc, bạn thanh toán thêm phần còn thiếu.
              </p>
              <ExampleTable
                rows={[
                  ["Tiền cọc", formatVnd(examples.settlement.depositAmount)],
                  [
                    "− Phí trễ hạn (trễ 1 ngày)",
                    formatVnd(examples.settlement.lateFee),
                  ],
                  [
                    "− Phí hư hỏng (ví dụ)",
                    formatVnd(examples.settlement.damageFee),
                  ],
                  [
                    "Tiền cọc hoàn lại",
                    formatVnd(examples.settlement.refundAmount),
                  ],
                ]}
              />
              <p className="text-sm text-muted-foreground">
                Tiền cọc được hoàn bằng chuyển khoản trong tối đa{" "}
                <strong className="text-foreground">
                  {policy.depositRefundBusinessDays} ngày làm việc
                </strong>{" "}
                (không tính thứ Bảy, Chủ nhật) kể từ khi trả máy hoặc huỷ đơn;
                bạn nhận thông báo kèm mã giao dịch khi tiền được chuyển.
              </p>
            </PolicyCard>
          </>
        )}

      <PolicyCard icon={RotateCcw} title="Huỷ đơn & hoàn cọc">
        <p>Mức hoàn cọc tính theo thời gian còn lại tới giờ nhận thiết bị:</p>
        <ExampleTable
          rows={[
            [
              `Từ ${full.minHoursBeforeStart} giờ trở lên`,
              `Hoàn ${full.percentage}%`,
            ],
            [
              `Từ ${partial.minHoursBeforeStart} đến dưới ${full.minHoursBeforeStart} giờ`,
              `Hoàn ${partial.percentage}%`,
            ],
            [
              `Dưới ${partial.minHoursBeforeStart} giờ hoặc đã nhận máy`,
              "Không hoàn",
            ],
          ]}
        />
        <p className="text-sm text-muted-foreground">
          Đơn bị huỷ do lỗi từ phía cửa hàng luôn được hoàn {full.percentage}%
          cọc. Ví dụ:{" "}
          {examples.refund
            .map(
              (r) =>
                `còn ${r.hoursBeforeStart} giờ → ${r.percentage > 0 ? `hoàn ${r.percentage}%` : "không hoàn"}`,
            )
            .join("; ")}
          .
        </p>
      </PolicyCard>

      <PolicyCard icon={AlarmClock} title="Phí trả thiết bị trễ hạn">
        <p>
          Phạt <strong className="text-primary">leo thang</strong>: ngày trễ thứ
          N phạt N × {pct(policy.lateFeeDailyRatio)} giá thuê/ngày, cộng dồn mọi
          ngày trễ, tối đa bằng giá trị thiết bị. Trễ vài giờ cũng tính tròn 1
          ngày.
        </p>
        <ExampleTable
          rows={examples.lateFee.byDays.map((d) => [
            `Trễ ${d.days} ngày (giá thuê ${formatVnd(examples.lateFee.pricePerDay)}/ngày)`,
            formatVnd(d.total),
          ])}
        />
      </PolicyCard>

      <PolicyCard icon={Clock4} title="Giữ chỗ & cách tính tiền thuê">
        <p>
          Đơn mới được giữ chỗ{" "}
          <strong className="text-primary">
            {policy.bookingTtlMinutes} phút
          </strong>{" "}
          để bạn thanh toán cọc; quá thời gian, đơn tự huỷ và khung giờ được mở
          lại.
        </p>
        <p>
          Thuê từ {policy.hourlyPricingMaxHours} giờ trở xuống tính theo giá/giờ
          (làm tròn lên), trên {policy.hourlyPricingMaxHours} giờ tính theo
          giá/ngày (làm tròn lên).
        </p>
      </PolicyCard>

      <PolicyCard icon={ShieldCheck} title="Xác thực danh tính">
        <p>
          Trước khi đặt thuê, bạn cần nộp số CCCD, ảnh CCCD 2 mặt và ảnh chân
          dung ở trang Tài khoản. Ảnh lưu riêng tư, chỉ quản trị viên xem được
          qua đường link có hạn.
        </p>
      </PolicyCard>

      <PolicyCard icon={FileSignature} title="Hợp đồng & trách nhiệm">
        <p>
          Khi nhận máy, nhân viên đối chiếu CCCD và bạn ký hợp đồng thuê. Hư
          hỏng do người thuê bồi thường chi phí sửa chữa thực tế; mất hoặc không
          sửa được bồi thường 100% giá trị thiết bị. Chiếm giữ thiết bị sẽ bị
          đưa vào danh sách đen và có thể bị trình báo cơ quan chức năng.
        </p>
      </PolicyCard>
    </div>
  );
}

export default async function PoliciesPage() {
  const policy = await fetchRentalPolicy();
  return (
    <div className="relative flex flex-1 flex-col">
      <SiteBackground />
      <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <p className="text-sm font-medium text-primary">Minh bạch, rõ ràng</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
          Chính sách thuê
        </h1>
        <p className="mt-3 max-w-2xl text-[15px] text-muted-foreground">
          Toàn bộ con số dưới đây được lấy trực tiếp từ hệ thống tính tiền của
          TechRent, giống hệt cách đơn thuê của bạn được tính.
        </p>
        <div className="mt-10">
          {policy ? (
            <PolicyContent policy={policy} />
          ) : (
            <div className="flex flex-col items-center gap-3 rounded-3xl border border-destructive/30 bg-destructive/5 px-6 py-14 text-center">
              <WifiOff className="size-8 text-destructive" aria-hidden />
              <p className="text-[15px]">
                Không tải được chính sách thuê. Vui lòng thử lại sau.
              </p>
              <Button
                variant="outline"
                nativeButton={false}
                render={<Link href="/policies" />}
              >
                Thử lại
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
