/**
 * Lớp nền xuyên suốt trang chủ — mount 1 LẦN DUY NHẤT ở page.tsx, bọc quanh
 * toàn bộ section (position: absolute inset-0 bên trong 1 wrapper `relative`
 * cao bằng đúng nội dung trang). Các blob đặt lệch theo % chiều cao container
 * nên tự trải dài đúng theo độ dài trang thật, không phụ thuộc số px cứng —
 * đây chính là cách "lấp khoảng trống đen" giữa các section thay vì để mỗi
 * section tự vẽ nền riêng rồi hở khoảng đen ở giữa.
 */
export function SiteBackground() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-20 overflow-hidden">
      <div className="absolute inset-0 bg-background" />

      <div className="absolute left-[-8%] top-[2%] h-[520px] w-[520px] rounded-full bg-cyan-500/20 blur-[140px]" />
      <div className="absolute right-[-6%] top-[16%] h-[420px] w-[420px] rounded-full bg-violet-600/15 blur-[130px]" />
      <div className="absolute left-[8%] top-[34%] h-[460px] w-[460px] rounded-full bg-blue-600/12 blur-[140px]" />
      <div className="absolute right-[2%] top-[48%] h-[480px] w-[480px] rounded-full bg-cyan-500/14 blur-[150px]" />
      <div className="absolute left-[-6%] top-[64%] h-[440px] w-[440px] rounded-full bg-violet-500/14 blur-[140px]" />
      <div className="absolute right-[-4%] top-[80%] h-[460px] w-[460px] rounded-full bg-cyan-600/14 blur-[140px]" />
      <div className="absolute left-[12%] top-[94%] h-[420px] w-[420px] rounded-full bg-violet-600/12 blur-[130px]" />

      <DecorativeLines />

      <div className="bg-noise absolute inset-0 opacity-[0.035] mix-blend-overlay" />
    </div>
  );
}

function DecorativeLines() {
  return (
    <svg
      className="absolute inset-0 h-full w-full opacity-[0.12]"
      viewBox="0 0 1000 3000"
      preserveAspectRatio="none"
      fill="none"
    >
      <path
        d="M120 0 C 400 300, -100 600, 250 950 S 700 1500, 300 1900 S 850 2500, 500 3000"
        stroke="#22d3ee"
        strokeWidth="2"
        strokeDasharray="2 14"
        strokeLinecap="round"
      />
      <path
        d="M880 100 C 600 450, 1050 800, 750 1150 S 300 1700, 700 2100 S 200 2650, 600 3000"
        stroke="#a78bfa"
        strokeWidth="2"
        strokeDasharray="2 14"
        strokeLinecap="round"
      />
    </svg>
  );
}
