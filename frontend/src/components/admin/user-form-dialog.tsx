"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormErrorBanner } from "@/components/form-error-banner";
import { KycImagesViewer } from "@/components/admin/kyc-images-viewer";
import { createUser, updateUser, type AdminUser } from "@/lib/admin-api";
import { getErrorMessage } from "@/lib/get-error-message";
import { ROLE_LABEL, ROLE_VALUES } from "@/lib/user-format";
import type { UserRole } from "@/stores/auth-store";

interface Props {
  user?: AdminUser;
  /** Đang sửa CHÍNH tài khoản đang đăng nhập — chặn tự đổi role của mình. */
  isSelf?: boolean;
}

type FieldErrors = Partial<Record<"name" | "email" | "password", string>>;

export function UserFormDialog({ user, isSelf = false }: Props) {
  const isEdit = !!user;
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>(user?.role ?? "customer");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      isEdit
        ? updateUser(user!.id, {
            name,
            phone: phone || undefined,
            // Chặn tự đổi role của chính mình ngay từ phía FE — backend
            // KHÔNG tự chặn điều này (UpdateUserDto cho phép đổi role thoải mái).
            role: isSelf ? undefined : role,
            password: password || undefined,
          })
        : createUser({ name, email, password, phone: phone || undefined, role }),
    onSuccess: () => {
      toast.success(isEdit ? "Đã lưu thay đổi" : "Đã tạo người dùng mới");
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      setOpen(false);
    },
    onError: (error) => {
      setServerError(
        getErrorMessage(error, "Không thể lưu người dùng, vui lòng thử lại"),
      );
    },
  });

  function validate(): FieldErrors {
    const errors: FieldErrors = {};
    if (!name.trim() || name.trim().length < 2) {
      errors.name = "Tên phải có ít nhất 2 ký tự";
    }
    if (!isEdit && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = "Email không hợp lệ";
    }
    if (!isEdit && password.length < 8) {
      errors.password = "Mật khẩu phải có ít nhất 8 ký tự";
    }
    if (isEdit && password && password.length < 8) {
      errors.password = "Mật khẩu mới phải có ít nhất 8 ký tự";
    }
    return errors;
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setServerError(null);

    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    mutation.mutate();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setServerError(null);
          setFieldErrors({});
        }
      }}
    >
      <DialogTrigger
        render={
          <Button
            variant={isEdit ? "ghost" : "default"}
            size={isEdit ? "icon-sm" : "default"}
            aria-label={isEdit ? "Sửa người dùng" : undefined}
          />
        }
      >
        {isEdit ? (
          <Pencil className="size-4" />
        ) : (
          <>
            <Plus /> Thêm người dùng
          </>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Sửa người dùng" : "Thêm người dùng mới"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {serverError && <FormErrorBanner message={serverError} />}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="user-name">Họ và tên</Label>
            <Input
              id="user-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nguyễn Văn A"
              aria-invalid={!!fieldErrors.name}
            />
            {fieldErrors.name && (
              <p className="text-xs text-destructive">{fieldErrors.name}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="user-email">Email</Label>
            <Input
              id="user-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ban@example.com"
              disabled={isEdit}
              aria-invalid={!!fieldErrors.email}
            />
            {isEdit ? (
              <p className="text-xs text-muted-foreground">
                Không thể đổi email sau khi tạo
              </p>
            ) : (
              fieldErrors.email && (
                <p className="text-xs text-destructive">{fieldErrors.email}</p>
              )
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="user-phone">Số điện thoại (không bắt buộc)</Label>
            <Input
              id="user-phone"
              value={phone ?? ""}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0901234567"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="user-password">
              {isEdit ? "Mật khẩu mới (bỏ trống nếu không đổi)" : "Mật khẩu"}
            </Label>
            <Input
              id="user-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Tối thiểu 8 ký tự"
              aria-invalid={!!fieldErrors.password}
            />
            {fieldErrors.password && (
              <p className="text-xs text-destructive">{fieldErrors.password}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Vai trò</Label>
            {isSelf ? (
              <p className="rounded-lg border border-border/60 px-2.5 py-1.5 text-sm text-muted-foreground">
                {ROLE_LABEL[role].label} — không thể tự đổi vai trò của chính mình
              </p>
            ) : (
              <Select
                value={role}
                onValueChange={(value) => setRole((value as UserRole | null) ?? "customer")}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_VALUES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {ROLE_LABEL[value].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={mutation.isPending}
            >
              Huỷ
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="animate-spin" />}
              Lưu
            </Button>
          </DialogFooter>
        </form>

        {/* Đặt NGOÀI <form> ở trên có chủ đích — nút trigger của Dialog lồng
         * bên trong (KycImagesViewer) không khai báo type="button", nếu nằm
         * trong <form> sẽ rơi về type="submit" mặc định của HTML và vô tình
         * submit form khi bấm. */}
        {isEdit && (
          <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-4">
            <p className="text-xs text-muted-foreground">
              {user.kycVerified
                ? "Đã xác thực danh tính"
                : "Chưa nộp hồ sơ xác thực danh tính"}
            </p>
            <KycImagesViewer userId={user.id} userName={user.name} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
