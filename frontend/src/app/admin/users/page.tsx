"use client";

import { cn } from "cn";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Trash2, Users, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { ConfirmDeleteDialog } from "@/components/admin/confirm-delete-dialog";
import { UserFormDialog } from "@/components/admin/user-form-dialog";
import { deleteUser, fetchUsers } from "@/lib/admin-api";
import { ROLE_LABEL } from "@/lib/user-format";
import { formatDateTimeVi } from "@/lib/device-format";
import { useAuthStore, type UserRole } from "@/stores/auth-store";

const PAGE_SIZE = 10;

export default function AdminUsersPage() {
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((state) => state.user);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<string>("all");

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const usersQuery = useQuery({
    queryKey: ["admin", "users", page, search, role],
    queryFn: () =>
      fetchUsers({
        page,
        limit: PAGE_SIZE,
        search: search || undefined,
        role: role === "all" ? undefined : (role as UserRole),
      }),
  });

  function handleChanged() {
    queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
  }

  const users = usersQuery.data?.data ?? [];
  const hasActiveFilters = search !== "" || role !== "all";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Tìm theo tên hoặc email..."
              className="w-64 pl-8"
            />
          </div>
          <Select
            value={role}
            onValueChange={(value) => {
              setRole(value ?? "all");
              setPage(1);
            }}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Mọi vai trò</SelectItem>
              {(Object.entries(ROLE_LABEL) as [UserRole, { label: string }][]).map(
                ([value, meta]) => (
                  <SelectItem key={value} value={value}>
                    {meta.label}
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
        </div>

        <UserFormDialog />
      </div>

      <div className="rounded-2xl border border-border/60 bg-card/50 p-4">
        {usersQuery.isPending ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        ) : usersQuery.isError ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <WifiOff className="size-10 text-muted-foreground/50" />
            <p className="text-muted-foreground">Không thể tải danh sách người dùng.</p>
            <Button onClick={() => usersQuery.refetch()}>Thử lại</Button>
          </div>
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <Users className="size-10 text-muted-foreground/40" />
            <p className="text-muted-foreground">
              {hasActiveFilters
                ? "Không có người dùng khớp với bộ lọc."
                : "Chưa có người dùng nào."}
            </p>
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Người dùng</TableHead>
                  <TableHead>Vai trò</TableHead>
                  <TableHead>Số điện thoại</TableHead>
                  <TableHead>Ngày tạo</TableHead>
                  <TableHead className="text-right">Hành động</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => {
                  const roleMeta = ROLE_LABEL[user.role];
                  const isSelf = user.id === currentUser?.id;
                  return (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div className="max-w-[220px]">
                          <p className="truncate font-medium">
                            {user.name}
                            {isSelf && (
                              <span className="ml-1.5 text-xs text-muted-foreground">
                                (bạn)
                              </span>
                            )}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {user.email}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs font-medium",
                            roleMeta.className,
                          )}
                        >
                          {roleMeta.label}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {user.phone || "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDateTimeVi(user.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <UserFormDialog user={user} isSelf={isSelf} />
                          {!isSelf && (
                            <ConfirmDeleteDialog
                              title="Xoá người dùng này?"
                              description={`Tài khoản "${user.name}" (${user.email}) sẽ bị xoá khỏi hệ thống. Hành động không thể hoàn tác.`}
                              onConfirm={() => deleteUser(user.id)}
                              onDeleted={handleChanged}
                              successMessage="Đã xoá người dùng"
                            >
                              <Trash2 className="size-4" />
                            </ConfirmDeleteDialog>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            <div className="mt-3">
              <AdminPagination
                page={page}
                totalPages={usersQuery.data?.meta.totalPages ?? 1}
                onPageChange={setPage}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
