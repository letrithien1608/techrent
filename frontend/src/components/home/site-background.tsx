import type { CSSProperties } from "react";

/**
 * Lớp nền xuyên suốt trang chủ — mount 1 LẦN DUY NHẤT ở page.tsx, bọc quanh
 * toàn bộ section (position: absolute inset-0 bên trong 1 wrapper `relative`
 * cao bằng đúng nội dung trang). Các blob đặt lệch theo % chiều cao container
 * nên tự trải dài đúng theo độ dài trang thật, không phụ thuộc số px cứng —
 * đây chính là cách "lấp khoảng trống đen" giữa các section thay vì để mỗi
 * section tự vẽ nền riêng rồi hở khoảng đen ở giữa.
 *
 * KHÔNG có "use client" — toàn bộ chuyển động (blob trôi, vệt sáng chạy dọc
 * mạch, particle "constellation", scan line) đều chỉ dùng CSS @keyframes
 * (globals.css) + inline style tĩnh cho duration/delay riêng từng phần tử,
 * KHÔNG dùng React state/JS chạy liên tục — nên component này vẫn render
 * được trực tiếp trong Server Component (page.tsx của `/`, `/devices`,
 * `/devices/[id]`, `/profile`) mà không cần thêm "use client" ở đâu cả.
 */
export function SiteBackground() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-20 overflow-hidden">
      <div className="absolute inset-0 bg-background" />

      <div
        className="animate-blob-drift absolute left-[-8%] top-[2%] h-[520px] w-[520px] rounded-full bg-cyan-500/20 blur-[140px]"
        style={{ animationDuration: "14s" }}
      />
      <div
        className="animate-blob-drift-alt absolute right-[-6%] top-[16%] h-[420px] w-[420px] rounded-full bg-violet-600/15 blur-[130px]"
        style={{ animationDuration: "11s", animationDelay: "-2s" }}
      />
      <div
        className="animate-blob-drift absolute left-[8%] top-[34%] h-[460px] w-[460px] rounded-full bg-blue-600/12 blur-[140px]"
        style={{ animationDuration: "16s", animationDelay: "-6s" }}
      />
      <div
        className="animate-blob-drift-alt absolute right-[2%] top-[48%] h-[480px] w-[480px] rounded-full bg-cyan-500/14 blur-[150px]"
        style={{ animationDuration: "13s", animationDelay: "-4s" }}
      />
      <div
        className="animate-blob-drift absolute left-[-6%] top-[64%] h-[440px] w-[440px] rounded-full bg-violet-500/14 blur-[140px]"
        style={{ animationDuration: "15s", animationDelay: "-8s" }}
      />
      <div
        className="animate-blob-drift-alt absolute right-[-4%] top-[80%] h-[460px] w-[460px] rounded-full bg-cyan-600/14 blur-[140px]"
        style={{ animationDuration: "12s", animationDelay: "-1s" }}
      />
      <div
        className="animate-blob-drift absolute left-[12%] top-[94%] h-[420px] w-[420px] rounded-full bg-violet-600/12 blur-[130px]"
        style={{ animationDuration: "17s", animationDelay: "-9s" }}
      />

      <DecorativeLines />
      <FlowingLines />
      <ParticleNetwork />
      <ScanLine />

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

/**
 * "Đường dây dữ liệu di chuyển" — vệt sáng chạy dọc theo các đường mạch,
 * kiểu circuit-trace/flight-path thường thấy ở trang công nghệ cao cấp
 * (NVIDIA, các trang AI/cybersecurity). Dùng kỹ thuật `stroke-dashoffset`
 * (không dùng `offset-path` — hỗ trợ trình duyệt hẹp hơn, và với dạng path
 * cong dài xuyên trang thì dash-offset cho hiệu ứng tương đương mà chắc
 * chắn chạy được ở MỌI trình duyệt hỗ trợ SVG). 2 "kiểu" trộn lẫn:
 * - "comet" (dash dài, gap rất lớn): đúng 1 vệt sáng đơn chạy hết đường
 * - "pulse-stream" (dash ngắn, gap ngắn): nhiều vệt nối tiếp như dòng dữ
 *   liệu chạy liên tục — tạo cảm giác "mạch điện tử" rõ hơn
 *
 * SỬA BUG GIẬT (03/10, buổi 2):
 * 1. KHÔNG còn SVG `<filter>`/`feGaussianBlur` áp lên path đang animate —
 *    filter blur phải được trình duyệt TÍNH LẠI TOÀN BỘ mỗi frame vì hình
 *    dạng dash animate liên tục thay đổi (khác hẳn 1 filter TĨNH áp lên
 *    phần tử chỉ animate transform/opacity — trường hợp đó trình duyệt
 *    cache được layer đã blur rồi chỉ di chuyển/đổi alpha layer, rẻ hơn
 *    nhiều). Đây là chi phí lớn nhất gây giật thật (frame drop) khi có 5
 *    path cùng animate trên 1 SVG trải dài hết trang. Bỏ blur, dùng trực
 *    tiếp màu sáng + `strokeLinecap="round"` để tạo cảm giác "vệt sáng"
 *    mà không cần filter.
 * 2. `--dash-cycle` (CSS custom property, set riêng từng path) = ĐÚNG
 *    1 chu kỳ `dash+gap` của path đó — đảm bảo `stroke-dashoffset` quay
 *    lại CHÍNH XÁC pha ban đầu mỗi vòng lặp, không còn "nhảy pha" tại
 *    điểm nối (trước đây dùng chung 1 giá trị `-1000` cho mọi path dù
 *    dasharray khác nhau — đây mới là nguyên nhân gây giật RÕ NHẤT, nhìn
 *    giống "chạy 1 đoạn rồi nhảy cóc" đúng như mô tả).
 */
function FlowingLines() {
  const lines: Array<{
    d: string;
    color: string;
    dash: number;
    gap: number;
    duration: string;
    delay: string;
  }> = [
    {
      d: "M60 -50 C 220 250, 10 550, 180 850 S 480 1350, 140 1700 S 420 2200, 120 2600 S 350 2900, 200 3050",
      color: "#22d3ee",
      dash: 50,
      gap: 3200,
      duration: "9s",
      delay: "0s",
    },
    {
      d: "M940 50 C 760 350, 980 650, 720 1000 S 920 1500, 680 1850 S 900 2300, 660 2650 S 850 2950, 700 3080",
      color: "#a78bfa",
      dash: 50,
      gap: 3200,
      duration: "11s",
      delay: "-3s",
    },
    {
      d: "M500 -30 C 650 300, 350 600, 520 950 S 250 1450, 480 1800 S 700 2250, 460 2600 S 620 2900, 500 3050",
      color: "#22d3ee",
      dash: 30,
      gap: 180,
      duration: "6s",
      delay: "-1s",
    },
    {
      d: "M300 -20 C 150 280, 420 580, 220 920 S 480 1420, 240 1780 S 60 2200, 300 2550 S 480 2880, 300 3030",
      color: "#a78bfa",
      dash: 24,
      gap: 150,
      duration: "7.5s",
      delay: "-2.5s",
    },
    {
      d: "M850 -40 C 680 260, 900 560, 650 900 S 420 1400, 700 1750 S 480 2180, 760 2520 S 550 2850, 800 3010",
      color: "#22d3ee",
      dash: 60,
      gap: 3400,
      duration: "13s",
      delay: "-5s",
    },
  ];

  return (
    <svg
      className="absolute inset-0 h-full w-full opacity-[0.55]"
      viewBox="0 0 1000 3000"
      preserveAspectRatio="none"
      fill="none"
    >
      {lines.map((line, index) => (
        <path
          key={index}
          d={line.d}
          stroke={line.color}
          strokeWidth="3.5"
          strokeLinecap="round"
          className="animate-flow-dash"
          style={
            {
              strokeDasharray: `${line.dash} ${line.gap}`,
              animationDuration: line.duration,
              animationDelay: line.delay,
              "--dash-cycle": `${-(line.dash + line.gap)}`,
            } as CSSProperties
          }
        />
      ))}
    </svg>
  );
}

const PARTICLE_POINTS: Array<{ x: number; y: number; duration: string; delay: string }> = [
  { x: 8, y: 12, duration: "7s", delay: "0s" },
  { x: 22, y: 28, duration: "9s", delay: "-2s" },
  { x: 15, y: 45, duration: "8s", delay: "-5s" },
  { x: 35, y: 15, duration: "10s", delay: "-1s" },
  { x: 48, y: 35, duration: "7.5s", delay: "-4s" },
  { x: 62, y: 10, duration: "9.5s", delay: "-3s" },
  { x: 70, y: 30, duration: "8.5s", delay: "-6s" },
  { x: 85, y: 20, duration: "11s", delay: "-2s" },
  { x: 90, y: 48, duration: "7s", delay: "-7s" },
  { x: 55, y: 55, duration: "9s", delay: "-4.5s" },
];

const PARTICLE_LINKS: Array<[number, number]> = [
  [0, 1],
  [1, 2],
  [1, 3],
  [3, 4],
  [4, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [4, 9],
  [6, 9],
];

/**
 * Mạng lưới điểm kết nối ("constellation") — CHỈ ở khu vực Hero (chiều cao
 * cố định, không phủ hết trang, tránh nặng). Đường nối vẽ TĨNH theo đúng vị
 * trí nghỉ của từng điểm (toạ độ % cố định, không tính lại khoảng cách lúc
 * chạy) — CHỈ bản thân điểm tự trôi nhẹ qua CSS, đổi lấy hiệu năng tốt hơn
 * hẳn so với việc tính toán khoảng cách giữa nhiều điểm bằng JS mỗi frame.
 */
function ParticleNetwork() {
  return (
    <div className="absolute inset-x-0 top-0 h-[900px]">
      <svg
        className="absolute inset-0 h-full w-full opacity-[0.15]"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        fill="none"
      >
        {PARTICLE_LINKS.map(([from, to], index) => {
          const a = PARTICLE_POINTS[from];
          const b = PARTICLE_POINTS[to];
          return (
            <line
              key={index}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="#22d3ee"
              strokeWidth="0.15"
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
      </svg>

      {PARTICLE_POINTS.map((point, index) => (
        <div
          key={index}
          className="animate-particle-drift absolute size-1.5 rounded-full bg-cyan-300 shadow-[0_0_6px_1px_rgba(34,211,238,0.8)]"
          style={{
            left: `${point.x}%`,
            top: `${point.y}%`,
            animationDuration: point.duration,
            animationDelay: point.delay,
          }}
        />
      ))}
    </div>
  );
}

/**
 * "Scan line" quét dọc chậm rãi — gợi cảm giác màn hình radar/dashboard
 * công nghệ. SỬA BUG GIẬT (03/10, buổi 2): đổi từ animate `top` (%, buộc
 * trình duyệt tính lại layout mỗi frame — KHÔNG được GPU composite) sang
 * `transform: translateY(vh)` — `vh` là 1 length hợp lệ trong `transform`
 * (khác `%`, vốn trong `transform` chỉ tính theo kích thước CHÍNH phần tử)
 * nên vẫn đi được 1 khoảng lớn mà không cần biết chiều cao trang thật,
 * đồng thời 100% GPU-composited như `transform` bình thường.
 */
function ScanLine() {
  return (
    <div
      className="animate-scan-sweep absolute inset-x-0 h-40 bg-gradient-to-b from-transparent via-cyan-400/10 to-transparent"
      style={{ transform: "translateY(-20vh)" }}
    />
  );
}
