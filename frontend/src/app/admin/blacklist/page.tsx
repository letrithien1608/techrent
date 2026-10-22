"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldAlert, WifiOff } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import { AdminPagination } from "@/components/admin/admin-pagination";
import { BlacklistEvidenceDialog } from "@/components/admin/blacklist-evidence-dialog";
import { BlacklistUserDialog } from "@/components/admin/blacklist-user-dialog";
import { fetchUsers } from "@/lib/admin-api";
import { formatDateTimeVi } from "@/lib/device-format";

const PAGE_SIZE = 10;

function initialsOf(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?";
}

export default function AdminBlacklistPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);

  const usersQuery = useQuery({
    queryKey: ["admin", "blacklist-users", page],
    queryFn: () =>
      fetchUsers({ page, limit: PAGE_SIZE, isBlacklisted: true }),
  });

  function handleChanged() {
    queryClient.invalidateQueries({ queryKey: ["admin", "blacklist-users"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
  }

  const users = usersQuery.data?.data ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Danh sách đen
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Khách hàng bị chặn đặt thuê do chiếm giữ/không trả thiết bị — gộp
          đủ bằng chứng (hồ sơ eKYC, đơn thuê, hợp đồng đã ký) để dùng khi
          trình báo công an/khởi kiện.
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/50">
        {usersQuery.isPending ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        ) : usersQuery.isError ? (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <WifiOff className="size-10 text-muted-foreground/50" />
            <p className="text-muted-foreground">Không thể tải danh sách đen.</p>
            <Button onClick={() => usersQuery.refetch()}>Thử lại</Button>
          </div>
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <ShieldAlert className="size-10 text-muted-foreground/40" />
            <p className="text-muted-foreground">
              Chưa có người dùng nào trong danh sách đen.
            </p>
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Người dùng</TableHead>
                  <TableHead>Lý do</TableHead>
                  <TableHead>Ngày vào danh sách đen</TableHead>
                  <TableHead className="text-right">Hành động</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="size-8 shrink-0">
                          <AvatarFallback className="bg-gradient-to-br from-destructive to-amber-500 text-xs font-semibold text-white">
                            {initialsOf(user.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="max-w-[200px] min-w-0">
                          <p className="truncate font-medium">{user.name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {user.email}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[280px] truncate text-muted-foreground">
                      {user.blacklistReason || "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {user.blacklistedAt ? formatDateTimeVi(user.blacklistedAt) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <BlacklistEvidenceDialog user={user} />
                        <BlacklistUserDialog user={user} onChanged={handleChanged} />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <AdminPagination
              page={page}
              totalPages={usersQuery.data?.meta.totalPages ?? 1}
              onPageChange={setPage}
            />
          </>
        )}
      </div>
    </div>
  );
}
