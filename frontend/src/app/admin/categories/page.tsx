"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Tags, Trash2, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CategoryFormDialog } from "@/components/admin/category-form-dialog";
import { ConfirmDeleteDialog } from "@/components/admin/confirm-delete-dialog";
import { deleteCategory } from "@/lib/admin-api";
import { fetchCategories } from "@/lib/devices-api";

export default function AdminCategoriesPage() {
  const queryClient = useQueryClient();
  const categoriesQuery = useQuery({ queryKey: ["categories"], queryFn: () => fetchCategories() });

  function handleChanged() {
    queryClient.invalidateQueries({ queryKey: ["categories"] });
  }

  const categories = categoriesQuery.data ?? [];

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/50">
        <div className="flex justify-end border-b border-border/60 p-4">
          <CategoryFormDialog />
        </div>

        {categoriesQuery.isPending ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-lg" />
            ))}
          </div>
        ) : categoriesQuery.isError ? (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <WifiOff className="size-10 text-muted-foreground/50" />
            <p className="text-muted-foreground">Không thể tải danh sách danh mục.</p>
            <Button onClick={() => categoriesQuery.refetch()}>Thử lại</Button>
          </div>
        ) : categories.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <Tags className="size-10 text-muted-foreground/40" />
            <p className="text-muted-foreground">Chưa có danh mục nào.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tên danh mục</TableHead>
                <TableHead>Mô tả</TableHead>
                <TableHead className="text-right">Hành động</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.map((category) => (
                <TableRow key={category.id}>
                  <TableCell className="font-medium">{category.name}</TableCell>
                  <TableCell className="max-w-sm truncate text-muted-foreground">
                    {category.description || "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Tooltip>
                        <TooltipTrigger render={<span className="inline-flex" />}>
                          <CategoryFormDialog category={category} />
                        </TooltipTrigger>
                        <TooltipContent>Sửa danh mục</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger render={<span className="inline-flex" />}>
                          <ConfirmDeleteDialog
                            title="Xoá danh mục này?"
                            description={`Danh mục "${category.name}" sẽ bị xoá. Nếu còn thiết bị thuộc danh mục này, hệ thống sẽ báo lỗi và không cho xoá.`}
                            onConfirm={() => deleteCategory(category.id)}
                            onDeleted={handleChanged}
                            successMessage="Đã xoá danh mục"
                          >
                            <Trash2 className="size-4" />
                          </ConfirmDeleteDialog>
                        </TooltipTrigger>
                        <TooltipContent>Xoá danh mục</TooltipContent>
                      </Tooltip>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
