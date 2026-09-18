import type { UserRole } from "@/stores/auth-store";

export const ROLE_LABEL: Record<UserRole, { label: string; className: string }> = {
  customer: { label: "Khách hàng", className: "bg-muted text-muted-foreground" },
  staff: { label: "Nhân viên", className: "bg-cyan-500/15 text-cyan-400" },
  admin: { label: "Quản trị viên", className: "bg-primary/15 text-primary" },
};

export const ROLE_VALUES = Object.keys(ROLE_LABEL) as UserRole[];
