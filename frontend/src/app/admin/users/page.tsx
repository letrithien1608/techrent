import { Users } from "lucide-react";

export default function AdminUsersPage() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border/60 py-24 text-center">
      <Users className="size-10 text-muted-foreground/40" />
      <div>
        <p className="font-heading text-lg font-semibold">Đang được phát triển</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Trang quản lý người dùng sẽ hoàn thiện ở buổi làm việc sau.
        </p>
      </div>
    </div>
  );
}
