"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useMutation } from "@tanstack/react-query";
import { IdCard, Loader2, Lock, ShieldCheck, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addCccdRequest, updateProfileRequest } from "@/lib/auth-api";
import { getErrorMessage } from "@/lib/get-error-message";
import {
  addCccdSchema,
  profileSchema,
  type AddCccdFormValues,
  type ProfileFormValues,
} from "@/lib/validation/auth-schemas";
import { useAuthStore } from "@/stores/auth-store";
import { FIELD_CLASS, FieldError, LABEL_CLASS, SectionCard } from "./profile-shared";

/**
 * Form bổ sung CCCD — CHỈ hiện khi `user.cccdMasked` chưa có (tài khoản cũ
 * tạo trước khi có KYC). Đã có thì không cho tự đổi (dữ liệu định danh).
 */
function AddCccdForm() {
  const updateUser = useAuthStore((state) => state.updateUser);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AddCccdFormValues>({
    resolver: zodResolver(addCccdSchema),
    mode: "onChange",
    defaultValues: { cccd: "" },
  });

  const mutation = useMutation({
    mutationFn: (values: AddCccdFormValues) => addCccdRequest(values.cccd),
    onSuccess: (updated) => {
      updateUser({ cccdMasked: updated.cccdMasked });
      toast.success("Đã bổ sung CCCD — giờ bạn có thể tiếp tục xác thực danh tính");
    },
    onError: (error) => toast.error(getErrorMessage(error, "Không thể bổ sung CCCD, vui lòng thử lại")),
  });

  return (
    <form onSubmit={handleSubmit((v) => mutation.mutate(v))} noValidate className="flex flex-col gap-2">
      <Label htmlFor="add-cccd" className={LABEL_CLASS}>
        Số CCCD (12 số)
      </Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id="add-cccd"
          inputMode="numeric"
          autoComplete="off"
          placeholder="079203012345"
          aria-invalid={!!errors.cccd}
          className={FIELD_CLASS}
          {...register("cccd")}
        />
        <Button type="submit" disabled={mutation.isPending} className="h-11 shrink-0 px-5">
          {mutation.isPending && <Loader2 className="animate-spin" />}
          Bổ sung CCCD
        </Button>
      </div>
      <FieldError message={errors.cccd?.message} />
      <p className="text-[13px] text-muted-foreground">
        Bắt buộc trước khi đặt thuê. Số CCCD được mã hoá khi lưu, chỉ hiển thị 4 số cuối.
      </p>
    </form>
  );
}

export function ProfileInfoSection() {
  const user = useAuthStore((state) => state.user);
  const updateUser = useAuthStore((state) => state.updateUser);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    // Kiểm tra ngay khi gõ (VD số điện thoại sai định dạng).
    mode: "onChange",
    defaultValues: { name: user?.name ?? "", phone: user?.phone ?? "" },
  });

  const mutation = useMutation({
    mutationFn: (values: ProfileFormValues) =>
      updateProfileRequest(user!.id, { name: values.name, phone: values.phone || undefined }),
    onSuccess: (updated) => {
      updateUser({ name: updated.name, phone: updated.phone });
      reset({ name: updated.name, phone: updated.phone ?? "" });
      toast.success("Đã lưu thông tin cá nhân");
    },
    onError: (error) => toast.error(getErrorMessage(error, "Không thể lưu thay đổi, vui lòng thử lại")),
  });

  if (!user) return null;

  return (
    <SectionCard
      id="personal-info"
      icon={UserRound}
      title="Thông tin cá nhân"
      description="Tên hiển thị và số điện thoại để cửa hàng liên hệ khi giao nhận máy."
    >
      <form onSubmit={handleSubmit((v) => mutation.mutate(v))} noValidate className="flex flex-col gap-5">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="profile-name" className={LABEL_CLASS}>
              Họ và tên
            </Label>
            <Input
              id="profile-name"
              autoComplete="name"
              aria-invalid={!!errors.name}
              className={FIELD_CLASS}
              {...register("name")}
            />
            <FieldError message={errors.name?.message} />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="profile-phone" className={LABEL_CLASS}>
              Số điện thoại
            </Label>
            <Input
              id="profile-phone"
              inputMode="tel"
              autoComplete="tel"
              placeholder="0901234567"
              aria-invalid={!!errors.phone}
              className={FIELD_CLASS}
              {...register("phone")}
            />
            <FieldError message={errors.phone?.message} />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="profile-email" className={LABEL_CLASS}>
              Email đăng nhập
            </Label>
            <div className="relative">
              <Input id="profile-email" value={user.email} readOnly aria-readonly className={`${FIELD_CLASS} cursor-default pr-11 text-muted-foreground`} />
              <Lock className="absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            </div>
            <p className="text-[13px] text-muted-foreground">Email dùng để đăng nhập, không thể thay đổi.</p>
          </div>

          {user.cccdMasked && (
            <div className="flex flex-col gap-2">
              <span className={LABEL_CLASS}>Số CCCD</span>
              <div className="flex h-11 items-center justify-between gap-2 rounded-xl border border-input bg-input/30 px-3.5">
                <span className="flex items-center gap-2 font-mono text-[15px] tracking-wider">
                  <IdCard className="size-4 text-muted-foreground" aria-hidden />
                  {user.cccdMasked}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
                  <ShieldCheck className="size-3.5" aria-hidden />
                  Đã xác thực
                </span>
              </div>
              <p className="text-[13px] text-muted-foreground">Dữ liệu định danh, liên hệ nhân viên nếu cần sửa.</p>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-border/60 pt-5">
          <Button type="submit" className="h-11 px-6" disabled={mutation.isPending || !isDirty}>
            {mutation.isPending && <Loader2 className="animate-spin" />}
            Lưu thay đổi
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-11 px-5"
            disabled={mutation.isPending || !isDirty}
            onClick={() => reset({ name: user.name, phone: user.phone ?? "" })}
          >
            Huỷ thay đổi
          </Button>
          {isDirty && <span className="text-[13px] text-amber-300">Bạn có thay đổi chưa lưu</span>}
        </div>
      </form>

      {!user.cccdMasked && (
        <div className="mt-6 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 sm:p-5">
          <AddCccdForm />
        </div>
      )}
    </SectionCard>
  );
}
