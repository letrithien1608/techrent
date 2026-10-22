"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, ShieldBan, ShieldCheck } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { FormErrorBanner } from "@/components/form-error-banner";
import { setUserBlacklist, type AdminUser } from "@/lib/admin-api";
import { getErrorMessage } from "@/lib/get-error-message";

/**
 * Đưa/gỡ 1 user khỏi danh sách đen (mục 7 Roadmap, mở rộng 22/10 buổi 6) —
 * dùng ở `/admin/users` (khởi tạo hành động) VÀ có thể tái dùng ở nơi khác
 * cần cùng hành động. Bắt buộc lý do khi đưa VÀO danh sách đen (dùng làm
 * bằng chứng khi cần trình báo công an/khởi kiện — xem `/admin/blacklist`).
 */
export function BlacklistUserDialog({
  user,
  onChanged,
}: {
  user: AdminUser;
  onChanged?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const isBlacklisted = user.isBlacklisted;

  const mutation = useMutation({
    mutationFn: (blacklisted: boolean) =>
      setUserBlacklist(user.id, {
        blacklisted,
        reason: blacklisted ? reason.trim() : undefined,
      }),
    onSuccess: (_, blacklisted) => {
      toast.success(
        blacklisted ? "Đã đưa vào danh sách đen" : "Đã gỡ khỏi danh sách đen",
      );
      onChanged?.();
      setOpen(false);
    },
    onError: (err) => {
      setError(getErrorMessage(err, "Không thể cập nhật trạng thái"));
    },
  });

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!isBlacklisted && !reason.trim()) {
      setError("Vui lòng nhập lý do");
      return;
    }
    mutation.mutate(!isBlacklisted);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setError(null);
          setReason("");
        }
      }}
    >
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={isBlacklisted ? "Gỡ khỏi danh sách đen" : "Đưa vào danh sách đen"}
          />
        }
      >
        {isBlacklisted ? (
          <ShieldCheck className="size-4 text-emerald-500" />
        ) : (
          <ShieldBan className="size-4 text-destructive" />
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {isBlacklisted ? "Gỡ khỏi danh sách đen?" : "Đưa vào danh sách đen?"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && <FormErrorBanner message={error} />}
          <p className="text-sm text-muted-foreground">
            {isBlacklisted
              ? `"${user.name}" (${user.email}) sẽ được gỡ khỏi danh sách đen và có thể đặt thuê lại bình thường.`
              : `"${user.name}" (${user.email}) sẽ bị chặn đặt thuê ngay lập tức. Vui lòng nhập lý do rõ ràng — dùng làm bằng chứng khi cần trình báo công an/khởi kiện.`}
          </p>
          {!isBlacklisted && (
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="VD: Không trả thiết bị quá 30 ngày kể từ hạn trả, không liên lạc được..."
              rows={4}
            />
          )}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={mutation.isPending}
            >
              Huỷ
            </Button>
            <Button
              type="submit"
              variant={isBlacklisted ? "default" : "destructive"}
              disabled={mutation.isPending}
            >
              {mutation.isPending && <Loader2 className="animate-spin" />}
              {isBlacklisted ? "Gỡ khỏi danh sách đen" : "Đưa vào danh sách đen"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
