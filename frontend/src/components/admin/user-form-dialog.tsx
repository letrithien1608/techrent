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
import { createUser, updateUser, type AdminUser } from "@/lib/admin-api";
import { getErrorMessage } from "@/lib/get-error-message";
import { ROLE_LABEL, ROLE_VALUES } from "@/lib/user-format";
import type { UserRole } from "@/stores/auth-store";

interface Props {
  user?: AdminUser;
  /** Đang sửa CHÍNH tài khoản đang đăng nhập — chặn tự đổi role của mình. */
  isSelf?: boolean;
}

export function UserFormDialog({ user, isSelf = false }: Props) {
  const isEdit = !!user;
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>(user?.role ?? "customer");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
      setErrorMessage(
        getErrorMessage(error, "Không thể lưu người dùng, vui lòng thử lại"),
      );
    },
  });

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setErrorMessage(null);

    if (!name.trim() || name.trim().length < 2) {
      setErrorMessage("Tên phải có ít nhất 2 ký tự");
      return;
    }
    if (!isEdit && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setErrorMessage("Email không hợp lệ");
      return;
    }
    if (!isEdit && password.length < 8) {
      setErrorMessage("Mật khẩu phải có ít nhất 8 ký tự");
      return;
    }
    if (isEdit && password && password.length < 8) {
      setErrorMessage("Mật khẩu mới phải có ít nhất 8 ký tự");
      return;
    }

    mutation.mutate();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setErrorMessage(null);
      }}
    >
      <DialogTrigger
        render={
          <Button
            variant={isEdit ? "ghost" : "default"}
            size={isEdit ? "icon-sm" : "default"}
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
          {errorMessage && <FormErrorBanner message={errorMessage} />}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="user-name">Họ và tên</Label>
            <Input
              id="user-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nguyễn Văn A"
            />
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
            />
            {isEdit && (
              <p className="text-xs text-muted-foreground">
                Không thể đổi email sau khi tạo
              </p>
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
            />
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
      </DialogContent>
    </Dialog>
  );
}
