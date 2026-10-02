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
import { FormErrorBanner } from "@/components/form-error-banner";
import { createCategory, updateCategory } from "@/lib/admin-api";
import type { Category } from "@/lib/devices-api";
import { getErrorMessage } from "@/lib/get-error-message";

export function CategoryFormDialog({ category }: { category?: Category }) {
  const isEdit = !!category;
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(category?.name ?? "");
  const [description, setDescription] = useState(category?.description ?? "");
  const [nameError, setNameError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      isEdit
        ? updateCategory(category!.id, { name, description: description || undefined })
        : createCategory({ name, description: description || undefined }),
    onSuccess: () => {
      toast.success(isEdit ? "Đã lưu thay đổi" : "Đã tạo danh mục mới");
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      setOpen(false);
    },
    onError: (error) => {
      setServerError(getErrorMessage(error, "Không thể lưu danh mục, vui lòng thử lại"));
    },
  });

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setServerError(null);
    if (!name.trim() || name.trim().length < 2) {
      setNameError("Tên danh mục phải có ít nhất 2 ký tự");
      return;
    }
    setNameError(null);
    mutation.mutate();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setServerError(null);
          setNameError(null);
        }
      }}
    >
      <DialogTrigger
        render={
          <Button
            variant={isEdit ? "ghost" : "default"}
            size={isEdit ? "icon-sm" : "default"}
            aria-label={isEdit ? "Sửa danh mục" : undefined}
          />
        }
      >
        {isEdit ? <Pencil className="size-4" /> : <><Plus /> Thêm danh mục</>}
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Sửa danh mục" : "Thêm danh mục mới"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {serverError && <FormErrorBanner message={serverError} />}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="category-name">Tên danh mục</Label>
            <Input
              id="category-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="VD: Laptop"
              aria-invalid={!!nameError}
            />
            {nameError && <p className="text-xs text-destructive">{nameError}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="category-description">Mô tả (không bắt buộc)</Label>
            <Input
              id="category-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="VD: Laptop văn phòng, gaming, đồ hoạ"
            />
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
