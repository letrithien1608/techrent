"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Check,
  CheckCircle2,
  Focus,
  IdCard,
  Loader2,
  ScanFace,
  ShieldCheck,
  Sun,
  UploadCloud,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { submitKycVerificationRequest } from "@/lib/auth-api";
import { getErrorMessage } from "@/lib/get-error-message";
import { useAuthStore } from "@/stores/auth-store";
import { SectionCard } from "./profile-shared";

const MAX_KYC_IMAGE_SIZE_BYTES = 8 * 1024 * 1024;

type SlotKey = "cccdFront" | "cccdBack" | "selfie";

const SLOTS: { key: SlotKey; title: string; hint: string; icon: LucideIcon }[] = [
  { key: "cccdFront", title: "CCCD mặt trước", hint: "Mặt có ảnh và thông tin cá nhân", icon: IdCard },
  { key: "cccdBack", title: "CCCD mặt sau", hint: "Mặt có mã QR và vân tay", icon: IdCard },
  { key: "selfie", title: "Ảnh chân dung", hint: "Nhìn thẳng camera, không đeo khẩu trang/kính đen", icon: ScanFace },
];

const PHOTO_TIPS: { icon: LucideIcon; text: string }[] = [
  { icon: Sun, text: "Chụp nơi đủ sáng" },
  { icon: Zap, text: "Không bị chói đèn flash" },
  { icon: Focus, text: "Rõ nét, thấy đủ 4 góc thẻ" },
  { icon: ScanFace, text: "Khuôn mặt nằm trọn khung hình" },
];

type StepState = "done" | "current" | "todo";

function Stepper({ steps }: { steps: { label: string; state: StepState }[] }) {
  return (
    <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Các bước xác thực">
      {steps.map((step, index) => (
        <li
          key={step.label}
          aria-current={step.state === "current" ? "step" : undefined}
          className={cn(
            "flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-[13px] sm:text-sm",
            step.state === "done" && "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
            step.state === "current" && "border-primary/50 bg-primary/10 text-foreground",
            step.state === "todo" && "border-border text-muted-foreground",
          )}
        >
          <span
            className={cn(
              "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
              step.state === "done" ? "bg-emerald-500 text-white" : step.state === "current" ? "bg-primary text-primary-foreground" : "bg-muted",
            )}
          >
            {step.state === "done" ? <Check className="size-3.5" aria-hidden /> : index + 1}
          </span>
          <span className="min-w-0 leading-tight font-medium">{step.label}</span>
        </li>
      ))}
    </ol>
  );
}

function KycSlotPicker({
  slot,
  file,
  onChange,
  disabled,
}: {
  slot: (typeof SLOTS)[number];
  file: File | null;
  onChange: (file: File | null) => void;
  disabled: boolean;
}) {
  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);
  const Icon = slot.icon;
  const tooLarge = !!file && file.size > MAX_KYC_IMAGE_SIZE_BYTES;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-semibold">{slot.title}</p>
        {file && !tooLarge && (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
            <Check className="size-3.5" aria-hidden /> Đã chọn
          </span>
        )}
      </div>
      {previewUrl ? (
        <div className={cn("relative overflow-hidden rounded-2xl border", tooLarge ? "border-red-500/60" : "border-border")}>
          {/* Ảnh xem trước cục bộ (blob: URL) — không dùng next/image vì remotePatterns không chấp nhận blob:. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewUrl} alt={`Xem trước ${slot.title}`} className="aspect-[4/3] w-full object-cover" />
          {!disabled && (
            <button
              type="button"
              onClick={() => onChange(null)}
              aria-label={`Chọn lại ảnh ${slot.title}`}
              className="absolute top-2 right-2 flex size-9 items-center justify-center rounded-full bg-background/85 text-foreground backdrop-blur outline-none hover:bg-destructive hover:text-white focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      ) : (
        <label
          className={cn(
            "flex aspect-[4/3] w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border bg-background/30 px-4 text-center transition-colors hover:border-primary/60 hover:bg-primary/5 focus-within:border-primary focus-within:ring-3 focus-within:ring-ring/40",
            disabled && "pointer-events-none opacity-50",
          )}
        >
          <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Icon className="size-6" aria-hidden />
          </span>
          <span className="text-sm font-medium">
            <UploadCloud className="mr-1 inline size-4 align-[-3px]" aria-hidden />
            Bấm để chọn ảnh
          </span>
          <span className="text-[13px] text-muted-foreground">{slot.hint}</span>
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            disabled={disabled}
            aria-label={`Chọn ảnh ${slot.title}`}
            onChange={(event) => {
              onChange(event.target.files?.[0] ?? null);
              event.target.value = "";
            }}
          />
        </label>
      )}
      {tooLarge && <p className="text-[13px] text-red-300">Ảnh vượt quá 8MB, vui lòng chọn ảnh nhỏ hơn.</p>}
    </div>
  );
}

export function KycVerificationSection() {
  const user = useAuthStore((state) => state.user);
  const updateUser = useAuthStore((state) => state.updateUser);
  const [files, setFiles] = useState<Record<SlotKey, File | null>>({ cccdFront: null, cccdBack: null, selfie: null });

  const mutation = useMutation({
    mutationFn: () => {
      const { cccdFront, cccdBack, selfie } = files;
      if (!cccdFront || !cccdBack || !selfie) {
        return Promise.reject(new Error("Vui lòng chọn đủ cả 3 ảnh trước khi gửi"));
      }
      return submitKycVerificationRequest({ cccdFront, cccdBack, selfie });
    },
    onSuccess: (updated) => {
      updateUser({ kycVerified: updated.kycVerified });
      toast.success("Đã nộp hồ sơ xác thực danh tính — giờ bạn có thể đặt thuê thiết bị");
    },
    onError: (error) => toast.error(getErrorMessage(error, "Không thể nộp hồ sơ, vui lòng thử lại")),
  });

  if (!user) return null;
  const verified = !!user.kycVerified;
  const allSelected = !!(files.cccdFront && files.cccdBack && files.selfie);
  const anyTooLarge = SLOTS.some((s) => (files[s.key]?.size ?? 0) > MAX_KYC_IMAGE_SIZE_BYTES);
  const firstMissing = SLOTS.findIndex((s) => !files[s.key]);
  const stepState = (index: number): StepState =>
    verified || files[SLOTS[index].key] ? "done" : index === firstMissing ? "current" : "todo";
  const steps = [
    ...SLOTS.map((s, i) => ({ label: s.title, state: stepState(i) })),
    { label: "Đã xác thực", state: (verified ? "done" : allSelected ? "current" : "todo") as StepState },
  ];

  return (
    <SectionCard
      id="kyc-verification"
      icon={ShieldCheck}
      title="Xác thực danh tính"
      description="Bắt buộc trước khi đặt thuê. Ảnh lưu riêng tư — chỉ quản trị viên xem được khi cần đối chiếu."
    >
      <div className="flex flex-col gap-6">
        <Stepper steps={steps} />

        {verified ? (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-5 py-4">
            <CheckCircle2 className="size-6 shrink-0 text-emerald-400" aria-hidden />
            <div>
              <p className="text-[15px] font-semibold">Tài khoản đã xác thực danh tính</p>
              <p className="text-[13px] text-muted-foreground">
                Hồ sơ chỉ nộp 1 lần. Cần làm lại thì liên hệ nhân viên TechRent.
              </p>
            </div>
          </div>
        ) : (
          <>
            <ul className="grid grid-cols-2 gap-2 lg:grid-cols-4" aria-label="Hướng dẫn chụp ảnh">
              {PHOTO_TIPS.map((tip) => (
                <li key={tip.text} className="flex items-center gap-2.5 rounded-xl bg-muted/30 px-3 py-2.5 text-[13px]">
                  <tip.icon className="size-4 shrink-0 text-primary" aria-hidden />
                  {tip.text}
                </li>
              ))}
            </ul>
            {!user.cccdMasked && (
              <p className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-200">
                Bạn cần bổ sung số CCCD ở mục Thông tin cá nhân trước khi nộp ảnh.
              </p>
            )}
            <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
              {SLOTS.map((slot) => (
                <KycSlotPicker
                  key={slot.key}
                  slot={slot}
                  file={files[slot.key]}
                  disabled={mutation.isPending}
                  onChange={(file) => setFiles((prev) => ({ ...prev, [slot.key]: file }))}
                />
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                className="h-11 px-6"
                disabled={!allSelected || anyTooLarge || mutation.isPending}
                onClick={() => mutation.mutate()}
              >
                {mutation.isPending ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
                Nộp hồ sơ xác thực
              </Button>
              {!allSelected && (
                <span className="text-[13px] text-muted-foreground">
                  Đã chọn {SLOTS.filter((s) => files[s.key]).length}/3 ảnh
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </SectionCard>
  );
}
