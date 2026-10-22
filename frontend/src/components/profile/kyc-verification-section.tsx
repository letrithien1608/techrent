"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  CheckCircle2,
  IdCard,
  Loader2,
  ScanFace,
  ShieldCheck,
  UploadCloud,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FormErrorBanner } from "@/components/form-error-banner";
import { submitKycVerificationRequest } from "@/lib/auth-api";
import { getErrorMessage } from "@/lib/get-error-message";
import { useAuthStore } from "@/stores/auth-store";

const MAX_KYC_IMAGE_SIZE_BYTES = 8 * 1024 * 1024;

type SlotKey = "cccdFront" | "cccdBack" | "selfie";

interface SlotConfig {
  key: SlotKey;
  title: string;
  hint: string;
}

const SLOTS: SlotConfig[] = [
  {
    key: "cccdFront",
    title: "CCCD mặt trước",
    hint: "Chụp rõ nét mặt có ảnh + thông tin, đủ sáng, không chói, không che góc",
  },
  {
    key: "cccdBack",
    title: "CCCD mặt sau",
    hint: "Chụp rõ nét mặt có mã QR/vân tay, đủ sáng, không chói, không che góc",
  },
  {
    key: "selfie",
    title: "Ảnh chân dung xác thực",
    hint: "Ảnh chụp mặt rõ ràng, đủ sáng, không đeo khẩu trang/kính đen, nhìn thẳng vào camera",
  },
];

/** 1 ô chọn ảnh — bấm để chọn, hiện preview + nút X để chọn lại, giống đúng
 * kiểu "ô upload" trong hướng dẫn eKYC ngân hàng (rõ ràng từng bước, từng mặt). */
function KycSlotPicker({
  slot,
  file,
  onChange,
  disabled,
}: {
  slot: SlotConfig;
  file: File | null;
  onChange: (file: File | null) => void;
  disabled: boolean;
}) {
  const previewUrl = useMemo(
    () => (file ? URL.createObjectURL(file) : null),
    [file],
  );

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  return (
    <div className="flex flex-col gap-2">
      <div>
        <p className="text-sm font-medium text-foreground">{slot.title}</p>
        <p className="text-xs text-muted-foreground">{slot.hint}</p>
      </div>

      {previewUrl ? (
        <div className="relative overflow-hidden rounded-xl border border-border/60">
          {/* Ảnh xem trước cục bộ (blob: URL) — KHÔNG dùng next/image vì
           * images.remotePatterns không (và không nên) whitelist blob: URL. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt={`Xem trước ${slot.title}`}
            className="aspect-[4/3] w-full object-cover"
          />
          {!disabled && (
            <button
              type="button"
              onClick={() => onChange(null)}
              aria-label={`Bỏ chọn ảnh ${slot.title}`}
              className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-full bg-background/80 text-foreground backdrop-blur hover:bg-destructive hover:text-destructive-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      ) : (
        <label
          className={
            "flex aspect-[4/3] w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border/60 text-center transition-colors hover:border-primary/50 hover:bg-muted/30" +
            (disabled ? " pointer-events-none opacity-50" : "")
          }
        >
          <UploadCloud className="size-7 text-muted-foreground" />
          <span className="px-2 text-xs text-muted-foreground">
            Bấm để chọn ảnh
          </span>
          <input
            type="file"
            accept="image/*"
            hidden
            disabled={disabled}
            onChange={(event) => {
              onChange(event.target.files?.[0] ?? null);
              event.target.value = "";
            }}
          />
        </label>
      )}
    </div>
  );
}

export function KycVerificationSection() {
  const user = useAuthStore((state) => state.user);
  const updateUser = useAuthStore((state) => state.updateUser);
  const [files, setFiles] = useState<Record<SlotKey, File | null>>({
    cccdFront: null,
    cccdBack: null,
    selfie: null,
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => {
      const { cccdFront, cccdBack, selfie } = files;
      if (!cccdFront || !cccdBack || !selfie) {
        return Promise.reject(
          new Error("Vui lòng chọn đủ cả 3 ảnh trước khi gửi"),
        );
      }
      return submitKycVerificationRequest({ cccdFront, cccdBack, selfie });
    },
    onSuccess: (updated) => {
      updateUser({ kycVerified: updated.kycVerified });
      toast.success("Đã nộp hồ sơ xác thực danh tính — giờ bạn có thể đặt thuê thiết bị");
    },
    onError: (error) => {
      setErrorMessage(
        getErrorMessage(error, "Không thể nộp hồ sơ, vui lòng thử lại"),
      );
    },
  });

  if (!user) return null;

  const allSelected = !!(files.cccdFront && files.cccdBack && files.selfie);
  const oversizedSlot = SLOTS.find(
    (s) => files[s.key] && files[s.key]!.size > MAX_KYC_IMAGE_SIZE_BYTES,
  );

  function handleSubmit() {
    setErrorMessage(null);
    if (oversizedSlot) {
      setErrorMessage(`Ảnh ${oversizedSlot.title} vượt quá 8MB, vui lòng chọn ảnh nhỏ hơn`);
      return;
    }
    mutation.mutate();
  }

  return (
    <motion.section
      id="kyc-verification"
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="scroll-mt-24 rounded-3xl border border-white/10 bg-white/[0.03] p-6 shadow-2xl shadow-black/20 backdrop-blur-xl sm:p-8"
    >
      <div className="flex items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <ScanFace className="size-5" />
        </div>
        <div>
          <h2 className="font-heading text-xl font-semibold">
            Xác thực danh tính
          </h2>
          <p className="text-sm text-muted-foreground">
            Bắt buộc trước khi đặt thuê — dữ liệu được lưu riêng tư, chỉ quản
            trị viên mới xem được khi cần xác minh tranh chấp.
          </p>
        </div>
      </div>

      {user.kycVerified ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3">
          <CheckCircle2 className="size-5 shrink-0 text-emerald-400" />
          <span className="text-sm font-medium text-foreground">
            Đã xác thực danh tính thành công
          </span>
          <span className="text-xs text-muted-foreground">
            — không thể tự nộp lại, liên hệ hỗ trợ nếu cần làm lại
          </span>
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-5">
          {errorMessage && <FormErrorBanner message={errorMessage} />}

          <div className="flex items-start gap-2 rounded-xl border border-border/60 bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
            <IdCard className="mt-0.5 size-4 shrink-0" />
            <p>
              Giống eKYC ngân hàng: chụp trong phòng đủ sáng, giữ CCCD/khuôn
              mặt nằm trọn trong khung hình, không bị chói đèn flash, không bị
              mờ/nhoè. Ảnh càng rõ, xác thực càng nhanh.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {SLOTS.map((slot) => (
              <KycSlotPicker
                key={slot.key}
                slot={slot}
                file={files[slot.key]}
                disabled={mutation.isPending}
                onChange={(file) =>
                  setFiles((prev) => ({ ...prev, [slot.key]: file }))
                }
              />
            ))}
          </div>

          <Button
            type="button"
            className="self-start"
            disabled={!allSelected || mutation.isPending}
            onClick={handleSubmit}
          >
            {mutation.isPending ? (
              <Loader2 className="animate-spin" />
            ) : (
              <ShieldCheck />
            )}
            Nộp hồ sơ xác thực
          </Button>
        </div>
      )}
    </motion.section>
  );
}
