"use client";

import { useState } from "react";
import type { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormErrorBanner } from "@/components/form-error-banner";
import { formatDateTimeVi } from "@/lib/device-format";

export interface BookingSchedule {
  startTime: Date;
  endTime: Date;
}

interface Props {
  value: BookingSchedule | null;
  onChange: (schedule: BookingSchedule) => void;
}

function combineDateAndTime(date: Date, timeStr: string): Date {
  const [hours, minutes] = timeStr.split(":").map(Number);
  const combined = new Date(date);
  combined.setHours(hours, minutes, 0, 0);
  return combined;
}

const todayStart = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
};

export function BookingSchedulePicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<DateRange | undefined>(
    value ? { from: value.startTime, to: value.endTime } : undefined,
  );
  const [startTimeStr, setStartTimeStr] = useState("08:00");
  const [endTimeStr, setEndTimeStr] = useState("18:00");
  const [error, setError] = useState<string | null>(null);

  function handleConfirm() {
    if (!range?.from) {
      setError("Vui lòng chọn ngày bắt đầu");
      return;
    }
    const startTime = combineDateAndTime(range.from, startTimeStr);
    const endTime = combineDateAndTime(range.to ?? range.from, endTimeStr);

    if (startTime.getTime() < Date.now()) {
      setError("Không thể chọn thời gian trong quá khứ");
      return;
    }
    if (endTime.getTime() <= startTime.getTime()) {
      setError("Thời gian kết thúc phải sau thời gian bắt đầu");
      return;
    }

    setError(null);
    onChange({ startTime, endTime });
    setOpen(false);
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg border border-border/60 p-2.5 text-left transition-colors hover:border-primary/40"
        >
          <p className="text-xs text-muted-foreground">Bắt đầu</p>
          <p className="truncate text-sm font-medium">
            {value ? formatDateTimeVi(value.startTime) : "Chọn ngày, giờ"}
          </p>
        </button>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg border border-border/60 p-2.5 text-left transition-colors hover:border-primary/40"
        >
          <p className="text-xs text-muted-foreground">Kết thúc</p>
          <p className="truncate text-sm font-medium">
            {value ? formatDateTimeVi(value.endTime) : "Chọn ngày, giờ"}
          </p>
        </button>
      </div>

      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (nextOpen) setError(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Chọn thời gian thuê</DialogTitle>
          </DialogHeader>

          <div className="flex justify-center">
            <Calendar
              mode="range"
              selected={range}
              onSelect={setRange}
              disabled={{ before: todayStart() }}
              numberOfMonths={1}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="booking-start-time">Giờ bắt đầu</Label>
              <Input
                id="booking-start-time"
                type="time"
                value={startTimeStr}
                onChange={(event) => setStartTimeStr(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="booking-end-time">Giờ kết thúc</Label>
              <Input
                id="booking-end-time"
                type="time"
                value={endTimeStr}
                onChange={(event) => setEndTimeStr(event.target.value)}
              />
            </div>
          </div>

          {error && <FormErrorBanner message={error} />}

          <DialogFooter>
            <Button onClick={handleConfirm} className="w-full">
              Xác nhận
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
