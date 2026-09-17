"use client";

import { useState, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { getErrorMessage } from "@/lib/get-error-message";

interface Props {
  title: string;
  description: string;
  onConfirm: () => Promise<unknown>;
  onDeleted?: () => void;
  successMessage?: string;
  triggerVariant?: "outline" | "destructive" | "ghost";
  triggerSize?: "sm" | "default" | "icon-sm";
  children: ReactNode;
}

export function ConfirmDeleteDialog({
  title,
  description,
  onConfirm,
  onDeleted,
  successMessage = "Đã xoá thành công",
  triggerVariant = "ghost",
  triggerSize = "icon-sm",
  children,
}: Props) {
  const [open, setOpen] = useState(false);

  const mutation = useMutation({
    mutationFn: onConfirm,
    onSuccess: () => {
      toast.success(successMessage);
      setOpen(false);
      onDeleted?.();
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Không thể xoá, vui lòng thử lại"));
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant={triggerVariant} size={triggerSize} />}>
        {children}
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={mutation.isPending}
          >
            Huỷ
          </Button>
          <Button
            variant="destructive"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending && <Loader2 className="animate-spin" />}
            Xác nhận xoá
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
