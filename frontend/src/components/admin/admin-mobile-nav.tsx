"use client";

import { useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Menu as MenuIcon, X } from "lucide-react";
import type { AuthUser } from "@/stores/auth-store";
import { AdminAccountMenu, AdminLogo, AdminNavLinks, BackToSiteLink } from "./admin-nav";

/** Điện thoại: nút ☰ mở ngăn kéo trượt từ trái (Dialog base-ui — có sẵn bẫy focus, Esc, bấm nền để đóng). */
export function AdminMobileNav({ user }: { user: AuthUser }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger
        aria-label="Mở menu quản trị"
        className="flex size-10 shrink-0 items-center justify-center rounded-lg text-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 md:hidden"
      >
        <MenuIcon className="size-5" />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Dialog.Popup className="fixed inset-y-0 left-0 z-[61] flex w-[min(300px,85vw)] flex-col border-r border-border bg-background shadow-2xl outline-none transition-transform duration-200 data-ending-style:-translate-x-full data-starting-style:-translate-x-full">
          <Dialog.Title className="sr-only">Menu quản trị</Dialog.Title>
          <div className="flex h-14 items-center justify-between border-b border-border/60 px-4">
            <AdminLogo onNavigate={close} />
            <Dialog.Close
              aria-label="Đóng menu"
              className="flex size-10 items-center justify-center rounded-lg outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <X className="size-5" />
            </Dialog.Close>
          </div>
          <nav aria-label="Điều hướng quản trị" className="scrollbar-thin flex flex-1 flex-col gap-1 overflow-y-auto p-3">
            <AdminNavLinks user={user} onNavigate={close} />
          </nav>
          <div className="flex flex-col gap-2 border-t border-border/60 p-3">
            <BackToSiteLink onNavigate={close} />
            <AdminAccountMenu user={user} />
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
