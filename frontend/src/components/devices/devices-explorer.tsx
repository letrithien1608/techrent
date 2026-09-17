"use client";

import { cn } from "cn";
import { useEffect, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import {
  AnimatePresence,
  motion,
  useInView,
  useMotionValueEvent,
  useScroll,
} from "framer-motion";
import { PackageOpen, Search, WifiOff, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { DeviceCard } from "@/components/devices/device-card";
import { DeviceCardSkeleton } from "@/components/devices/device-card-skeleton";
import { fetchDevices, type Category, type DeviceSort } from "@/lib/devices-api";

const PAGE_SIZE = 12;
const SKELETON_COUNT = 8;

const SORT_LABEL: Record<DeviceSort, string> = {
  newest: "Mới nhất",
  price_asc: "Giá tăng dần",
  price_desc: "Giá giảm dần",
};

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as const },
  },
};

function CategoryChip({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative shrink-0 rounded-full border border-transparent px-3.5 py-1.5 text-sm font-medium transition-colors"
    >
      {active && (
        <motion.span
          layoutId="devices-category-active-pill"
          className="absolute inset-0 rounded-full bg-primary"
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
        />
      )}
      <span
        className={cn(
          "relative z-10",
          active
            ? "text-primary-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        {children}
      </span>
      {!active && (
        <span className="absolute inset-0 rounded-full border border-border/60" />
      )}
    </button>
  );
}

function LoadingDots() {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <span className="flex items-center gap-1">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="size-2 rounded-full bg-primary"
            animate={{ opacity: [0.25, 1, 0.25], scale: [0.8, 1.1, 0.8] }}
            transition={{
              duration: 1.1,
              repeat: Infinity,
              ease: "easeInOut",
              delay: i * 0.18,
            }}
          />
        ))}
      </span>
      Đang tải thêm...
    </div>
  );
}

function EmptyOrErrorIcon({
  icon: Icon,
  tone = "muted",
}: {
  icon: typeof Search;
  tone?: "muted" | "destructive";
}) {
  return (
    <div className="relative">
      <div
        aria-hidden
        className={cn(
          "absolute left-1/2 top-1/2 -z-10 size-24 -translate-x-1/2 -translate-y-1/2 rounded-full blur-2xl",
          tone === "destructive" ? "bg-destructive/20" : "bg-primary/15",
        )}
      />
      <Icon className="size-12 text-muted-foreground/50" />
    </div>
  );
}

export function DevicesExplorer({ categories }: { categories: Category[] }) {
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [sort, setSort] = useState<DeviceSort>("newest");
  const [isScrolled, setIsScrolled] = useState(false);

  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, "change", (latest) => {
    setIsScrolled(latest > 8);
  });

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchInput.trim()), 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const query = useInfiniteQuery({
    queryKey: ["devices", { debouncedSearch, categoryId, onlyAvailable, sort }],
    queryFn: ({ pageParam }) =>
      fetchDevices({
        page: pageParam,
        limit: PAGE_SIZE,
        categoryId: categoryId ?? undefined,
        status: onlyAvailable ? "available" : undefined,
        sort,
        search: debouncedSearch || undefined,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      const meta = lastPage.result?.meta;
      if (!meta) return undefined;
      const nextPage = allPages.length + 1;
      return nextPage <= meta.totalPages ? nextPage : undefined;
    },
  });

  const devices = query.data?.pages.flatMap((page) => page.result?.data ?? []) ?? [];
  const hasFetchError =
    query.isError || (query.data?.pages.some((page) => page.hasError) ?? false);
  const isEmpty = !query.isPending && !hasFetchError && devices.length === 0;
  const hasActiveFilters =
    debouncedSearch !== "" || categoryId !== null || onlyAvailable || sort !== "newest";

  const loadMoreRef = useRef<HTMLDivElement>(null);
  const isLoadMoreInView = useInView(loadMoreRef, { margin: "400px" });

  useEffect(() => {
    if (isLoadMoreInView && query.hasNextPage && !query.isFetchingNextPage) {
      query.fetchNextPage();
    }
  }, [isLoadMoreInView, query]);

  function resetFilters() {
    setSearchInput("");
    setDebouncedSearch("");
    setCategoryId(null);
    setOnlyAvailable(false);
    setSort("newest");
  }

  return (
    <>
      <div
        className={cn(
          "sticky top-14 z-30 border-b transition-all duration-300",
          isScrolled
            ? "border-border/60 bg-background/90 shadow-sm shadow-black/10 backdrop-blur-xl"
            : "border-transparent bg-background/60 backdrop-blur-sm",
        )}
      >
        <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6">
          <motion.div
            initial="hidden"
            animate="show"
            variants={fadeUp}
            className="relative mx-auto max-w-xl"
          >
            <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Tìm thiết bị theo tên..."
              className="h-11 rounded-full border-border/60 bg-card pl-11 pr-4 shadow-sm shadow-black/5 transition-shadow focus-visible:border-primary/60 focus-visible:ring-4 focus-visible:ring-primary/25"
            />
          </motion.div>

          <motion.div
            initial="hidden"
            animate="show"
            variants={fadeUp}
            transition={{ delay: 0.08 }}
            className="mt-4 flex flex-wrap items-center justify-between gap-3"
          >
            <div className="flex flex-wrap items-center gap-2 overflow-x-auto">
              <CategoryChip active={categoryId === null} onClick={() => setCategoryId(null)}>
                Tất cả
              </CategoryChip>
              {categories.map((category) => (
                <CategoryChip
                  key={category.id}
                  active={categoryId === category.id}
                  onClick={() => setCategoryId(category.id)}
                >
                  {category.name}
                </CategoryChip>
              ))}
            </div>

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2.5 rounded-full border border-border/60 py-1.5 pl-3 pr-4 text-sm font-medium text-foreground">
                <Switch
                  checked={onlyAvailable}
                  onCheckedChange={setOnlyAvailable}
                  className="scale-110"
                />
                Còn hàng
              </label>
              <Select
                value={sort}
                onValueChange={(value) => setSort(value as DeviceSort)}
              >
                <SelectTrigger className="w-[160px]">
                  <SelectValue>
                    {(value: DeviceSort) => SORT_LABEL[value]}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Mới nhất</SelectItem>
                  <SelectItem value="price_asc">Giá tăng dần</SelectItem>
                  <SelectItem value="price_desc">Giá giảm dần</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </motion.div>
        </div>
      </div>

      <div className="relative mx-auto max-w-6xl px-4 py-10 sm:px-6">
        {query.isPending ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: SKELETON_COUNT }).map((_, index) => (
              <DeviceCardSkeleton key={index} />
            ))}
          </div>
        ) : hasFetchError && devices.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border/60 py-24 text-center">
            <EmptyOrErrorIcon icon={WifiOff} tone="destructive" />
            <div>
              <p className="font-heading text-lg font-semibold">
                Không thể tải danh sách thiết bị
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Đã có lỗi xảy ra khi kết nối tới máy chủ — vui lòng thử lại.
              </p>
            </div>
            <Button onClick={() => query.refetch()}>Thử lại</Button>
          </div>
        ) : isEmpty ? (
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border/60 py-24 text-center">
            <EmptyOrErrorIcon icon={Search} />
            <div>
              <p className="font-heading text-lg font-semibold">
                Không tìm thấy thiết bị phù hợp
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Thử đổi từ khoá tìm kiếm hoặc bỏ bớt bộ lọc đang áp dụng.
              </p>
            </div>
            {hasActiveFilters && (
              <Button variant="outline" onClick={resetFilters}>
                <X /> Xoá bộ lọc
              </Button>
            )}
          </div>
        ) : (
          <>
            <motion.div
              layout
              className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            >
              <AnimatePresence mode="popLayout">
                {devices.map((device, index) => (
                  <motion.div
                    key={device.id}
                    layout
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{
                      duration: 0.35,
                      delay: Math.min(index % PAGE_SIZE, 7) * 0.05,
                    }}
                  >
                    <DeviceCard device={device} />
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>

            {query.hasNextPage && (
              <div ref={loadMoreRef} className="flex justify-center py-10">
                {query.isFetchingNextPage ? (
                  <LoadingDots />
                ) : (
                  <PackageOpen className="size-5 text-muted-foreground/30" />
                )}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
