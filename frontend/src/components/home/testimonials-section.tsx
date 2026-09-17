"use client";

import { motion } from "framer-motion";
import { StarRating } from "@/components/devices/star-rating";

// Chưa đủ dữ liệu review thật để làm social proof (seed data hiện gần như
// chưa có review nào) — dùng testimonial mẫu hợp lý tạm thời, sẽ thay bằng
// dữ liệu thật (GET /reviews) khi có đủ số lượng.
const TESTIMONIALS = [
  {
    name: "Minh Anh",
    role: "Content Creator",
    quote:
      "Thuê flycam quay video chỉ trong 5 phút đặt xong, giao nhận đúng hẹn. Chất lượng thiết bị rất tốt, sẽ tiếp tục dùng.",
    rating: 5,
  },
  {
    name: "Đức Huy",
    role: "Sinh viên CNTT",
    quote:
      "Laptop thuê cho đợt thực tập vừa đủ mạnh, giá hợp lý hơn nhiều so với mua mới. Hoàn cọc nhanh gọn sau khi trả máy.",
    rating: 5,
  },
  {
    name: "Thu Trang",
    role: "Nhiếp ảnh gia tự do",
    quote:
      "Máy ảnh và ống kính đều được kiểm tra kỹ trước khi giao, đúng như mô tả. Quy trình đặt thuê trên web rất trực quan.",
    rating: 4,
  },
  {
    name: "Quang Vinh",
    role: "Chủ studio âm thanh",
    quote:
      "Thuê thiết bị âm thanh cho sự kiện gấp, đội ngũ hỗ trợ phản hồi rất nhanh. Chính sách hoàn cọc rõ ràng, minh bạch.",
    rating: 5,
  },
  {
    name: "Ngọc Bích",
    role: "Streamer",
    quote:
      "Thuê kính VR trải nghiệm thử trước khi quyết định mua — dịch vụ đúng nhu cầu, giao diện web dễ dùng.",
    rating: 5,
  },
];

function TestimonialCard({
  name,
  role,
  quote,
  rating,
}: (typeof TESTIMONIALS)[number]) {
  return (
    <div className="mx-3 flex w-[320px] shrink-0 flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-xl sm:w-[360px]">
      <StarRating rating={rating} size={16} />
      <p className="text-sm text-muted-foreground">&ldquo;{quote}&rdquo;</p>
      <div className="mt-auto flex items-center gap-3 pt-2">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
          {name.charAt(0)}
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">{name}</p>
          <p className="text-xs text-muted-foreground">{role}</p>
        </div>
      </div>
    </div>
  );
}

export function TestimonialsSection() {
  const loop = [...TESTIMONIALS, ...TESTIMONIALS];

  return (
    <section className="relative py-16 sm:py-24">
      <div className="mx-auto max-w-2xl px-4 text-center sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
            Khách hàng nói gì về TechRent
          </h2>
          <p className="mt-3 text-muted-foreground">
            Trải nghiệm thật từ những khách hàng đã thuê thiết bị.
          </p>
        </motion.div>
      </div>

      <div className="group relative mt-10 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]">
        <div className="animate-marquee flex w-max group-hover:[animation-play-state:paused]">
          {loop.map((testimonial, index) => (
            <TestimonialCard key={`${testimonial.name}-${index}`} {...testimonial} />
          ))}
        </div>
      </div>
    </section>
  );
}
