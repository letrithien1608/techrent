import Link from "next/link";
import { Globe, Mail, MessageCircle } from "lucide-react";

const PRODUCT_LINKS = [
  { label: "Thiết bị", href: "/devices" },
  { label: "Đăng ký", href: "/register" },
  { label: "Đăng nhập", href: "/login" },
];

const SUPPORT_LINKS = [
  { label: "Trang chủ", href: "/" },
  { label: "Đơn của tôi", href: "/bookings" },
];

// Icon "kết nối" chỉ mang tính trang trí (dự án đồ án chưa có kênh mạng xã
// hội thật) — cố tình KHÔNG gắn href/thẻ <a> để tránh dẫn tới URL không có
// thật, chỉ hiển thị hình ảnh cho đúng bố cục footer nhiều cột. Bộ icon của
// project này không có logo thương hiệu (Facebook/Instagram...), dùng icon
// khái quát (Globe/Mail/MessageCircle) thay thế.
const SOCIAL_ICONS = [Globe, Mail, MessageCircle];

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="relative border-t border-border/60 bg-background">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
          <div className="col-span-2 sm:col-span-1">
            <div className="flex items-center gap-2 font-heading font-semibold text-foreground">
              <span className="inline-flex size-6 items-center justify-center rounded-md bg-primary text-xs text-primary-foreground">
                T
              </span>
              Tech<span className="text-primary">Rent</span>
            </div>
            <p className="mt-3 max-w-[220px] text-sm text-muted-foreground">
              Nền tảng cho thuê thiết bị công nghệ nhanh, đáng tin cậy.
            </p>
            <div className="mt-4 flex items-center gap-3">
              {SOCIAL_ICONS.map((Icon, index) => (
                <span
                  key={index}
                  aria-hidden
                  className="flex size-8 items-center justify-center rounded-full border border-border/60 text-muted-foreground"
                >
                  <Icon className="size-4" />
                </span>
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold text-foreground">Sản phẩm</p>
            <ul className="mt-3 space-y-2">
              {PRODUCT_LINKS.map(({ label, href }) => (
                <li key={label}>
                  <Link
                    href={href}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-sm font-semibold text-foreground">Hỗ trợ</p>
            <ul className="mt-3 space-y-2">
              {SUPPORT_LINKS.map(({ label, href }) => (
                <li key={label}>
                  <Link
                    href={href}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-10 border-t border-border/60 pt-6 text-center text-sm text-muted-foreground">
          © {year} TechRent — Nền tảng cho thuê thiết bị công nghệ.
        </div>
      </div>
    </footer>
  );
}
