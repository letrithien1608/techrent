"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { IdCard, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormErrorBanner } from "@/components/form-error-banner";
import { addCccdRequest, updateProfileRequest } from "@/lib/auth-api";
import { getErrorMessage } from "@/lib/get-error-message";
import {
  addCccdSchema,
  profileSchema,
  type AddCccdFormValues,
  type ProfileFormValues,
} from "@/lib/validation/auth-schemas";
import { useAuthStore } from "@/stores/auth-store";

function initialsOf(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?";
}

/**
 * Form bổ sung CCCD — CHỈ hiện khi `user.cccdMasked` chưa có (tài khoản cũ
 * tạo trước khi có KYC, hoặc bỏ sót lúc đăng ký). Sau khi bổ sung, KHÔNG cho
 * tự đổi lại nữa — đây là dữ liệu định danh, đổi thật cần luồng xác minh
 * riêng (ngoài phạm vi hiện tại), nên component này tự ẩn hẳn khi đã có CCCD.
 */
function AddCccdForm() {
  const updateUser = useAuthStore((state) => state.updateUser);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AddCccdFormValues>({
    resolver: zodResolver(addCccdSchema),
    defaultValues: { cccd: "" },
  });

  const mutation = useMutation({
    mutationFn: (values: AddCccdFormValues) => addCccdRequest(values.cccd),
    onSuccess: (updated) => {
      updateUser({ cccdMasked: updated.cccdMasked });
      toast.success("Đã bổ sung CCCD — giờ bạn có thể đặt thuê thiết bị");
    },
    onError: (error) => {
      setErrorMessage(
        getErrorMessage(error, "Không thể bổ sung CCCD, vui lòng thử lại"),
      );
    },
  });

  function onSubmit(values: AddCccdFormValues) {
    setErrorMessage(null);
    mutation.mutate(values);
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className="mt-3 flex flex-col gap-3"
    >
      {errorMessage && <FormErrorBanner message={errorMessage} />}
      <p className="text-sm text-muted-foreground">
        Bạn cần bổ sung số CCCD để xác minh danh tính trước khi đặt thuê thiết
        bị — dữ liệu được mã hoá khi lưu, không hiển thị đầy đủ ở bất kỳ đâu.
      </p>
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-2">
        <div className="flex-1">
          <Input
            id="add-cccd"
            inputMode="numeric"
            autoComplete="off"
            placeholder="079203012345"
            aria-invalid={!!errors.cccd}
            {...register("cccd")}
          />
          {errors.cccd && (
            <p className="mt-1 text-xs text-destructive">{errors.cccd.message}</p>
          )}
        </div>
        <Button type="submit" disabled={mutation.isPending} className="shrink-0">
          {mutation.isPending && <Loader2 className="animate-spin" />}
          Xác nhận
        </Button>
      </div>
    </form>
  );
}

export function ProfileInfoSection() {
  const user = useAuthStore((state) => state.user);
  const updateUser = useAuthStore((state) => state.updateUser);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: user?.name ?? "", phone: user?.phone ?? "" },
  });

  const mutation = useMutation({
    mutationFn: (values: ProfileFormValues) =>
      updateProfileRequest(user!.id, {
        name: values.name,
        phone: values.phone || undefined,
      }),
    onSuccess: (updated) => {
      updateUser({ name: updated.name, phone: updated.phone });
      // Đặt lại form về "sạch" (isDirty=false) với giá trị vừa lưu — nút
      // "Lưu thay đổi" tự disable lại cho tới khi người dùng sửa tiếp.
      reset({ name: updated.name, phone: updated.phone ?? "" });
      toast.success("Đã lưu thay đổi");
    },
    onError: (error) => {
      setErrorMessage(
        getErrorMessage(error, "Không thể lưu thay đổi, vui lòng thử lại"),
      );
    },
  });

  if (!user) return null;

  function onSubmit(values: ProfileFormValues) {
    setErrorMessage(null);
    mutation.mutate(values);
  }

  return (
    <motion.section
      id="personal-info"
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="scroll-mt-24 rounded-3xl border border-white/10 bg-white/[0.03] p-6 shadow-2xl shadow-black/20 backdrop-blur-xl sm:p-8"
    >
      <div className="flex items-center gap-4">
        <div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-cyan-400 font-heading text-xl font-bold text-primary-foreground sm:size-20 sm:text-2xl">
          {initialsOf(user.name)}
        </div>
        <div>
          <h2 className="font-heading text-xl font-semibold">
            Thông tin cá nhân
          </h2>
          <p className="text-sm text-muted-foreground">
            Cập nhật tên hiển thị và số điện thoại liên hệ.
          </p>
        </div>
      </div>

      <form
        onSubmit={handleSubmit(onSubmit)}
        noValidate
        className="mt-6 flex flex-col gap-4"
      >
        {errorMessage && <FormErrorBanner message={errorMessage} />}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="profile-name">Họ và tên</Label>
          <Input
            id="profile-name"
            aria-invalid={!!errors.name}
            {...register("name")}
          />
          {errors.name && (
            <p className="text-xs text-destructive">{errors.name.message}</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="profile-email">Email</Label>
          <Input id="profile-email" value={user.email} disabled />
          <p className="text-xs text-muted-foreground">
            Email dùng để đăng nhập, không thể thay đổi.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="profile-phone">Số điện thoại</Label>
          <Input
            id="profile-phone"
            placeholder="0901234567"
            aria-invalid={!!errors.phone}
            {...register("phone")}
          />
          {errors.phone && (
            <p className="text-xs text-destructive">{errors.phone.message}</p>
          )}
        </div>

        <Button
          type="submit"
          className="mt-2 self-start"
          disabled={mutation.isPending || !isDirty}
        >
          {mutation.isPending && <Loader2 className="animate-spin" />}
          Lưu thay đổi
        </Button>
      </form>

      <div className="mt-6 border-t border-border/60 pt-6">
        <div className="flex items-center gap-2">
          <IdCard className="size-4 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">Số CCCD</p>
        </div>

        {user.cccdMasked ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <ShieldCheck className="size-4 shrink-0 text-emerald-400" />
            <span className="font-mono text-sm">{user.cccdMasked}</span>
            <span className="text-xs text-muted-foreground">
              — đã xác thực, không thể tự đổi
            </span>
          </div>
        ) : (
          <AddCccdForm />
        )}
      </div>
    </motion.section>
  );
}
