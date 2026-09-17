"use client";

import { cn } from "cn";
import { useState } from "react";
import { Star } from "lucide-react";

interface Props {
  value: number;
  onChange: (value: number) => void;
  size?: number;
  disabled?: boolean;
}

export function StarRatingInput({ value, onChange, size = 28, disabled }: Props) {
  const [hoverValue, setHoverValue] = useState<number | null>(null);
  const displayValue = hoverValue ?? value;

  return (
    <div
      className="flex items-center gap-1"
      role="radiogroup"
      aria-label="Chọn số sao đánh giá"
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          role="radio"
          aria-checked={value === star}
          aria-label={`${star} sao`}
          disabled={disabled}
          onClick={() => onChange(star)}
          onMouseEnter={() => setHoverValue(star)}
          onMouseLeave={() => setHoverValue(null)}
          className="rounded p-0.5 transition-transform hover:scale-110 disabled:pointer-events-none disabled:opacity-50"
        >
          <Star
            style={{ width: size, height: size }}
            className={cn(
              "fill-current transition-colors",
              star <= displayValue ? "text-amber-400" : "text-muted-foreground/25",
            )}
          />
        </button>
      ))}
    </div>
  );
}
