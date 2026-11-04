"use client";

import { cn } from "cn";
import { Suspense } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2, Users, WifiOff } from "lucide-react";
import { UserAvatar } from "@/components/account/user-avatar";
import { Button } from "@/components/ui/button";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AdminPagination } from "@/components/admin/admin-pagination";
import {
  AdminFilterPanel,
  AdminSearchInput,
  FilterSwitch,
  HighlightText,
  NoResults,
  ResultSummary,
} from "@/components/admin/admin-list-filters";
import { BlacklistUserDialog } from "@/components/admin/blacklist-user-dialog";
import { ConfirmDeleteDialog } from "@/components/admin/confirm-delete-dialog";
import { UserFormDialog } from "@/components/admin/user-form-dialog";
import { useUrlFilters } from "@/hooks/use-url-filters";
import {
  deleteUser,
  fetchUsers,
  type AdminUserRow,
  type KycFilter,
  type LoginMethod,
} from "@/lib/admin-api";
import { ROLE_LABEL } from "@/lib/user-format";
import { formatDateTimeVi } from "@/lib/device-format";
import { useAuthStore, type UserRole } from "@/stores/auth-store";

const PAGE_SIZE = 10;

const KYC_FILTERS: { value: KycFilter | "all"; label: string }[] = [
  { value: "all", label: "Mọi trạng thái eKYC" },
  { value: "none", label: "Chưa nộp eKYC" },
  { value: "pending", label: "eKYC nộp chưa đủ" },
  { value: "verified", label: "Đã xác thực eKYC" },
];

const LOGIN_FILTERS: { value: LoginMethod | "all"; label: string }[] = [
  { value: "all", label: "Mọi cách đăng nhập" },
  { value: "password", label: "Mật khẩu" },
  { value: "google", label: "Google" },
  { value: "facebook", label: "Facebook" },
];

const SORTS = [
  { value: "newest", label: "Mới tạo nhất" },
  { value: "name", label: "Tên A–Z" },
] as const;

// Tham số trên URL. `demo=show` = hiện tài khoản dữ liệu mẫu (mặc định ẩn).
const FILTER_KEYS = ["q", "role", "kyc", "blacklist", "debt", "login", "demo", "sort"] as const;

export default function AdminUsersPage() {
  // useSearchParams() (trong useUrlFilters) bắt buộc nằm trong <Suspense>.
  return (
    <Suspense fallback={null}>
      <AdminUsersContent />
    </Suspense>
  );
}

function LoginBadges({ user }: { user: AdminUserRow }) {
  const methods = [
    ...(user.hasPassword ? ["Mật khẩu"] : []),
    ...user.socialProviders.map((p) => (p === "google" ? "Google" : "Facebook")),
  ];
  return (
    <div className="flex flex-wrap gap-1">
      {methods.map((method) => (
        <span key={method} className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
          {method}
        </span>
      ))}
    </div>
  );
}

function AdminUsersContent() {
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((state) => state.user);
  const filters = useUrlFilters(FILTER_KEYS);
  const { values: f, page } = filters;

  const role = Object.keys(ROLE_LABEL).includes(f.role) ? (f.role as UserRole) : "all";
  const kyc = KYC_FILTERS.some((item) => item.value === f.kyc) ? (f.kyc as KycFilter) : "all";
  const login = LOGIN_FILTERS.some((item) => item.value === f.login) ? (f.login as LoginMethod) : "all";
  const sort = f.sort === "name" ? "name" : "newest";
  const showDemo = f.demo === "show";
  // Chỉ đổi cách sắp xếp thì không tính là đang lọc.
  const isFiltered = filters.activeCount - (f.sort ? 1 : 0) > 0;

  const clearFilters = filters.clear;

  const usersQuery = useQuery({
    queryKey: ["admin", "users", page, f],
    queryFn: () =>
      fetchUsers({
        page,
        limit: PAGE_SIZE,
        search: f.q || undefined,
        role: role === "all" ? undefined : role,
        kycStatus: kyc === "all" ? undefined : kyc,
        loginMethod: login === "all" ? undefined : login,
        isBlacklisted: f.blacklist === "1" || undefined,
        hasDebt: f.debt === "1" || undefined,
        hideDemo: !showDemo,
        sort,
      }),
  });

  function handleChanged() {
    queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
  }

  const users = usersQuery.data?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/50">
        <div className="flex flex-wrap items-center gap-2 border-b border-border/60 p-4">
          <AdminSearchInput
            value={f.q}
            onSearch={(q) => filters.update({ q })}
            placeholder="Tên, email, SĐT hoặc 4 số cuối CCCD..."
            className="min-w-0 flex-1 basis-60"
          />
          <AdminFilterPanel activeCount={filters.activeCount - (f.q ? 1 : 0)} onClear={clearFilters}>
            <Select
              value={role}
              onValueChange={(value) => filters.update({ role: value === "all" ? null : value })}
            >
              <SelectTrigger className="h-9 w-36" aria-label="Vai trò">
                <SelectValue>
                  {(value: string) =>
                    value === "all" ? "Mọi vai trò" : ROLE_LABEL[value as UserRole]?.label
                  }
                </SelectValue>
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
            <Select
              value={kyc}
              onValueChange={(value) => filters.update({ kyc: value === "all" ? null : value })}
            >
              <SelectTrigger className="h-9 w-48" aria-label="Trạng thái eKYC">
                <SelectValue>
                  {(value: string) => KYC_FILTERS.find((item) => item.value === value)?.label}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {KYC_FILTERS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={login}
              onValueChange={(value) => filters.update({ login: value === "all" ? null : value })}
            >
              <SelectTrigger className="h-9 w-48" aria-label="Cách đăng nhập">
                <SelectValue>
                  {(value: string) => LOGIN_FILTERS.find((item) => item.value === value)?.label}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {LOGIN_FILTERS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FilterSwitch
              label="Trong danh sách đen"
              checked={f.blacklist === "1"}
              onCheckedChange={(checked) => filters.update({ blacklist: checked ? "1" : null })}
            />
            <FilterSwitch
              label="Còn nợ"
              checked={f.debt === "1"}
              onCheckedChange={(checked) => filters.update({ debt: checked ? "1" : null })}
            />
            <FilterSwitch
              label="Ẩn tài khoản dữ liệu mẫu"
              checked={!showDemo}
              onCheckedChange={(checked) => filters.update({ demo: checked ? null : "show" })}
            />
            <Select
              value={sort}
              onValueChange={(value) => filters.update({ sort: value === "name" ? "name" : null })}
            >
              <SelectTrigger className="h-9 w-48" aria-label="Sắp xếp">
                <SelectValue>
                  {(value: string) => `Sắp xếp: ${SORTS.find((item) => item.value === value)?.label}`}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {SORTS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </AdminFilterPanel>
          <UserFormDialog />
        </div>

        <ResultSummary
          total={usersQuery.data?.meta.total}
          unit="người dùng"
          loading={usersQuery.isPending}
          filtered={isFiltered}
          onClear={clearFilters}
        />

        {usersQuery.isPending ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        ) : usersQuery.isError ? (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <WifiOff className="size-10 text-muted-foreground/50" />
            <p className="text-muted-foreground">Không thể tải danh sách người dùng.</p>
            <Button onClick={() => usersQuery.refetch()}>Thử lại</Button>
          </div>
        ) : users.length === 0 ? (
          isFiltered ? (
            <NoResults message="Không có người dùng khớp từ khoá và bộ lọc." onClear={clearFilters} />
          ) : (
            <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
              <Users className="size-10 text-muted-foreground/40" />
              <p className="text-muted-foreground">Chưa có người dùng nào.</p>
            </div>
          )
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Người dùng</TableHead>
                  <TableHead>Vai trò</TableHead>
                  <TableHead>SĐT / CCCD</TableHead>
                  <TableHead>Xác thực &amp; đăng nhập</TableHead>
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
                        <div className="flex items-center gap-3">
                          <UserAvatar name={user.name} src={user.avatarUrl} size="xs" className="ring-0" />
                          <div className="max-w-[220px] min-w-0">
                            <p className="truncate font-medium">
                              <HighlightText text={user.name} query={f.q} />
                              {isSelf && (
                                <span className="ml-1.5 text-xs text-muted-foreground">
                                  (bạn)
                                </span>
                              )}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              <HighlightText text={user.email} query={f.q} />
                            </p>
                          </div>
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
                        <p>{user.phone ? <HighlightText text={user.phone} query={f.q} /> : "—"}</p>
                        {user.cccdMasked && (
                          <p className="font-mono text-xs">
                            <HighlightText text={user.cccdMasked} query={f.q} />
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          <span
                            className={cn(
                              "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                              user.kycVerified
                                ? "bg-emerald-500/15 text-emerald-400"
                                : "bg-muted text-muted-foreground",
                            )}
                          >
                            {user.kycVerified ? "Đã eKYC" : "Chưa eKYC"}
                          </span>
                          {user.isBlacklisted && (
                            <span className="rounded-full bg-destructive/15 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
                              Danh sách đen
                            </span>
                          )}
                          {user.hasDebt && (
                            <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
                              Còn nợ
                            </span>
                          )}
                        </div>
                        <div className="mt-1">
                          <LoginBadges user={user} />
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDateTimeVi(user.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Tooltip>
                            <TooltipTrigger render={<span className="inline-flex" />}>
                              <UserFormDialog user={user} isSelf={isSelf} />
                            </TooltipTrigger>
                            <TooltipContent>Sửa người dùng</TooltipContent>
                          </Tooltip>
                          {!isSelf && (
                            <>
                              <Tooltip>
                                <TooltipTrigger render={<span className="inline-flex" />}>
                                  <BlacklistUserDialog user={user} onChanged={handleChanged} />
                                </TooltipTrigger>
                                <TooltipContent>
                                  {user.isBlacklisted ? "Gỡ khỏi danh sách đen" : "Đưa vào danh sách đen"}
                                </TooltipContent>
                              </Tooltip>
                              {/* Backend chặn VĨNH VIỄN xoá user đã blacklist (giữ cccdHash
                               * chiếm giữ để chặn đăng ký lại — xem CLAUDE.md) — ẩn nút ở đây
                               * để không dẫn admin vào 1 hành động chắc chắn thất bại. */}
                              {!user.isBlacklisted && (
                                <Tooltip>
                                  <TooltipTrigger render={<span className="inline-flex" />}>
                                    <ConfirmDeleteDialog
                                      title="Xoá người dùng này?"
                                      description={`Tài khoản "${user.name}" (${user.email}) sẽ bị xoá khỏi hệ thống. Hành động không thể hoàn tác.`}
                                      onConfirm={() => deleteUser(user.id)}
                                      onDeleted={handleChanged}
                                      successMessage="Đã xoá người dùng"
                                    >
                                      <Trash2 className="size-4" />
                                    </ConfirmDeleteDialog>
                                  </TooltipTrigger>
                                  <TooltipContent>Xoá người dùng</TooltipContent>
                                </Tooltip>
                              )}
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            <AdminPagination
              page={page}
              totalPages={usersQuery.data?.meta.totalPages ?? 1}
              onPageChange={filters.setPage}
            />
          </>
        )}
      </div>
    </div>
  );
}
