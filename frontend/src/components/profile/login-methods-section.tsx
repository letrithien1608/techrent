"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, KeyRound, Loader2, LogIn, Mail } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { cn } from "cn";
import { PROVIDER_LOGO } from "@/components/auth/social-login-buttons";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { getErrorMessage } from "@/lib/get-error-message";
import {
  SOCIAL_PROVIDER_LABEL,
  fetchSocialAccounts,
  fetchSocialProviders,
  setPasswordRequest,
  startSocialLink,
  unlinkSocialAccount,
  type SocialProvider,
} from "@/lib/social-auth-api";
import { useAuthStore } from "@/stores/auth-store";
import { FieldError, LABEL_CLASS, PasswordInput, SectionCard } from "./profile-shared";

const setPasswordSchema = z
  .object({
    newPassword: z.string().min(8, "Mật khẩu phải có ít nhất 8 ký tự"),
    confirmNewPassword: z.string().min(1, "Vui lòng xác nhận mật khẩu"),
  })
  .refine((d) => d.newPassword === d.confirmNewPassword, {
    message: "Mật khẩu xác nhận không khớp",
    path: ["confirmNewPassword"],
  });
type SetPasswordValues = z.infer<typeof setPasswordSchema>;

const ROW_CLASS =
  "flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3.5";

function SetPasswordForm({ onDone }: { onDone: () => void }) {
  const updateUser = useAuthStore((s) => s.updateUser);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SetPasswordValues>({
    resolver: zodResolver(setPasswordSchema),
    mode: "onTouched",
    defaultValues: { newPassword: "", confirmNewPassword: "" },
  });
  const mutation = useMutation({
    mutationFn: (values: SetPasswordValues) => setPasswordRequest(values.newPassword),
    onSuccess: () => {
      updateUser({ hasPassword: true });
      toast.success("Đã đặt mật khẩu — giờ bạn có thể đăng nhập bằng email và mật khẩu");
      onDone();
    },
    onError: (error) => toast.error(getErrorMessage(error, "Không thể đặt mật khẩu, vui lòng thử lại")),
  });

  return (
    <form
      className="mt-3 grid w-full gap-4 sm:grid-cols-2"
      onSubmit={handleSubmit((v) => mutation.mutate(v))}
      noValidate
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="set-new-password" className={LABEL_CLASS}>
          Mật khẩu mới
        </Label>
        <PasswordInput id="set-new-password" autoComplete="new-password" aria-invalid={!!errors.newPassword} {...register("newPassword")} />
        <FieldError message={errors.newPassword?.message} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="set-confirm-password" className={LABEL_CLASS}>
          Nhập lại mật khẩu
        </Label>
        <PasswordInput
          id="set-confirm-password"
          autoComplete="new-password"
          aria-invalid={!!errors.confirmNewPassword}
          {...register("confirmNewPassword")}
        />
        <FieldError message={errors.confirmNewPassword?.message} />
      </div>
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" className="h-11 rounded-xl px-5" disabled={mutation.isPending}>
          {mutation.isPending && <Loader2 className="animate-spin" />}
          Lưu mật khẩu
        </Button>
        <Button type="button" variant="ghost" className="h-11 rounded-xl" onClick={onDone}>
          Huỷ
        </Button>
      </div>
    </form>
  );
}

/**
 * Phương thức đăng nhập: email + mật khẩu (đặt mật khẩu nếu tài khoản tạo bằng
 * mạng xã hội) và liên kết/gỡ Google, Facebook. Không gỡ được phương thức cuối
 * cùng — nút bị khoá ở đây, backend cũng chặn (SocialAuthService.unlink).
 */
export function LoginMethodsSection() {
  const queryClient = useQueryClient();
  const email = useAuthStore((s) => s.user?.email);
  const [settingPassword, setSettingPassword] = useState(false);
  const [confirmUnlink, setConfirmUnlink] = useState<SocialProvider | null>(null);

  const accountsQuery = useQuery({ queryKey: ["auth", "social-accounts"], queryFn: fetchSocialAccounts });
  const providersQuery = useQuery({
    queryKey: ["auth", "social-providers"],
    queryFn: fetchSocialProviders,
    staleTime: 5 * 60_000,
  });

  const linkMutation = useMutation({
    mutationFn: startSocialLink,
    onSuccess: (url) => {
      window.location.href = url;
    },
    onError: (error) => toast.error(getErrorMessage(error, "Không thể bắt đầu liên kết")),
  });
  const unlinkMutation = useMutation({
    mutationFn: unlinkSocialAccount,
    onSuccess: (_data, provider) => {
      toast.success(`Đã gỡ liên kết ${SOCIAL_PROVIDER_LABEL[provider]}`);
      setConfirmUnlink(null);
      void queryClient.invalidateQueries({ queryKey: ["auth", "social-accounts"] });
    },
    onError: (error) => toast.error(getErrorMessage(error, "Không thể gỡ liên kết")),
  });

  const data = accountsQuery.data;
  const linked = new Map((data?.accounts ?? []).map((a) => [a.provider, a]));
  // Provider đang bật + provider đã liên kết (kể cả khi đã bị tắt sau đó, để còn gỡ được).
  const providers = Array.from(new Set<SocialProvider>([...(providersQuery.data ?? []), ...linked.keys()]));
  const methodCount = (data?.hasPassword ? 1 : 0) + linked.size;

  return (
    <SectionCard
      id="login-methods"
      icon={LogIn}
      title="Phương thức đăng nhập"
      description="Đăng nhập bằng email + mật khẩu, Google hoặc Facebook. Luôn phải còn ít nhất 1 cách đăng nhập."
    >
      {accountsQuery.isPending ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-16 w-full rounded-2xl" />
          <Skeleton className="h-16 w-full rounded-2xl" />
        </div>
      ) : accountsQuery.isError ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm">
          Không tải được danh sách phương thức đăng nhập.
          <Button variant="outline" size="sm" onClick={() => accountsQuery.refetch()}>
            Thử lại
          </Button>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          <li className={ROW_CLASS}>
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                <Mail className="size-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="font-medium">Email và mật khẩu</p>
                <p className="truncate text-sm text-muted-foreground">
                  {data?.hasPassword ? email : "Chưa đặt mật khẩu — chưa đăng nhập bằng email được"}
                </p>
              </div>
            </div>
            {data?.hasPassword ? (
              <span className="flex items-center gap-1.5 text-sm text-emerald-400">
                <CheckCircle2 className="size-4" aria-hidden /> Đang dùng
              </span>
            ) : (
              !settingPassword && (
                <Button variant="outline" className="h-10 rounded-xl" onClick={() => setSettingPassword(true)}>
                  <KeyRound className="size-4" aria-hidden />
                  Đặt mật khẩu
                </Button>
              )
            )}
            {settingPassword && !data?.hasPassword && (
              <SetPasswordForm
                onDone={() => {
                  setSettingPassword(false);
                  void queryClient.invalidateQueries({ queryKey: ["auth", "social-accounts"] });
                }}
              />
            )}
          </li>

          {providers.map((provider) => {
            const account = linked.get(provider);
            const Logo = PROVIDER_LOGO[provider];
            const isLast = !!account && methodCount <= 1;
            return (
              <li key={provider} className={ROW_CLASS}>
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white">
                    <Logo className={cn("size-5", provider === "facebook" && "text-[#1877F2]")} />
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium">{SOCIAL_PROVIDER_LABEL[provider]}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {account ? `Đã liên kết${account.email ? ` · ${account.email}` : ""}` : "Chưa liên kết"}
                    </p>
                    {isLast && (
                      <p className="mt-0.5 text-xs text-amber-300">
                        Đây là cách đăng nhập duy nhất — đặt mật khẩu trước khi gỡ.
                      </p>
                    )}
                  </div>
                </div>
                {account ? (
                  confirmUnlink === provider ? (
                    <div className="flex gap-2">
                      <Button
                        variant="destructive"
                        className="h-10 rounded-xl"
                        disabled={unlinkMutation.isPending}
                        onClick={() => unlinkMutation.mutate(provider)}
                      >
                        {unlinkMutation.isPending && <Loader2 className="animate-spin" />}
                        Xác nhận gỡ
                      </Button>
                      <Button variant="ghost" className="h-10 rounded-xl" onClick={() => setConfirmUnlink(null)}>
                        Huỷ
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      className="h-10 rounded-xl"
                      disabled={isLast}
                      onClick={() => setConfirmUnlink(provider)}
                    >
                      Gỡ liên kết
                    </Button>
                  )
                ) : (
                  <Button
                    variant="outline"
                    className="h-10 rounded-xl"
                    disabled={linkMutation.isPending}
                    onClick={() => linkMutation.mutate(provider)}
                  >
                    {linkMutation.isPending && linkMutation.variables === provider && (
                      <Loader2 className="animate-spin" />
                    )}
                    Liên kết
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}
