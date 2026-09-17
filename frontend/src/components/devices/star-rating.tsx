import { cn } from "cn";
import { Star } from "lucide-react";

export function StarRating({
  rating,
  size = 16,
}: {
  rating: number;
  size?: number;
}) {
  return (
    <div
      className="flex items-center gap-0.5"
      role="img"
      aria-label={`${rating.toFixed(1)} trên 5 sao`}
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          style={{ width: size, height: size }}
          className={cn(
            "fill-current",
            star <= Math.round(rating)
              ? "text-amber-400"
              : "text-muted-foreground/25",
          )}
        />
      ))}
    </div>
  );
}
