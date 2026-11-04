"use client";

import { UserAvatar } from "@/components/account/user-avatar";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { BadgeCheck, Package } from "lucide-react";
import { StarRating } from "@/components/devices/star-rating";
import type { FeaturedReview } from "@/lib/devices-api";

function TestimonialCard({ review }: { review: FeaturedReview }) {
  return (
    <div className="mx-3 flex w-[320px] shrink-0 flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-xl sm:w-[360px]">
      <StarRating rating={review.rating} size={16} />
      <p className="line-clamp-4 text-sm text-muted-foreground">&ldquo;{review.comment}&rdquo;</p>
      <div className="mt-auto flex items-center gap-3 pt-2">
        <UserAvatar name={review.reviewerName} src={review.reviewerAvatarUrl} size="lg" className="size-10 text-sm ring-0" />
        <div className="min-w-0">
          <p className="flex items-center gap-1 text-sm font-medium text-foreground">
            {review.reviewerName}
            {review.verifiedRental && (
              <BadgeCheck className="size-3.5 text-emerald-500" aria-label="Đã thuê thiết bị này" />
            )}
          </p>
          <Link
            href={`/devices/${review.device.id}`}
            className="flex items-center gap-1.5 truncate text-xs text-muted-foreground hover:text-primary"
          >
            <span className="relative size-5 shrink-0 overflow-hidden rounded bg-muted">
              {review.device.image ? (
                <Image src={review.device.image} alt="" fill sizes="20px" className="object-cover" />
              ) : (
                <Package className="size-5 p-0.5" />
              )}
            </span>
            <span className="truncate">
              {review.verifiedRental ? "Đã thuê" : "Đánh giá"} {review.device.name}
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}

/** Đánh giá thật 4–5★ mới nhất của khách — không có đánh giá nào thì ẩn cả mục. */
export function TestimonialsSection({ reviews }: { reviews: FeaturedReview[] }) {
  if (reviews.length === 0) return null;
  // Nhân đôi để dải chạy ngang liền mạch; ít đánh giá quá thì nhân thêm cho đủ rộng.
  const base = reviews.length < 4 ? [...reviews, ...reviews] : reviews;
  const loop = [...base, ...base];

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
            Đánh giá thật từ khách đã thuê và trả thiết bị tại TechRent.
          </p>
        </motion.div>
      </div>

      <div className="group relative mt-10 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]">
        <div className="animate-marquee flex w-max group-hover:[animation-play-state:paused]">
          {loop.map((review, index) => (
            <TestimonialCard key={`${review.id}-${index}`} review={review} />
          ))}
        </div>
      </div>
    </section>
  );
}
