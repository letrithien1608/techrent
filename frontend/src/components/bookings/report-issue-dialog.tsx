"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormErrorBanner } from "@/components/form-error-banner";
import { PhotoPicker } from "@/components/admin/photo-picker";
import { reportIssue } from "@/lib/bookings-api";
import { getErrorMessage } from "@/lib/get-error-message";

const MIN_DESCRIPTION = 10;
const MAX_MEDIA = 5;

/** Khách báo lỗi thiết bị từ đơn đang thuê (mô tả bắt buộc + ảnh/video). */
export function ReportIssueDialog({ bookingId, onReported }: { bookingId: string; onReported: () => void }) {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => reportIssue(bookingId, description.trim(), files),
    onSuccess: () => {
      toast.success("Đã gửi báo lỗi — cửa hàng sẽ liên hệ bạn sớm");
      setOpen(false);
      setDescription("");
      setFiles([]);
      onReported();
    },
    onError: (err) => setError(getErrorMessage(err, "Không gửi được báo lỗi, vui lòng thử lại")),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}>
        <TriangleAlert className="size-4 text-amber-400" />
        Báo lỗi thiết bị
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Báo lỗi thiết bị</DialogTitle>
          <DialogDescription>
            Mô tả lỗi và gửi kèm ảnh/video. Cửa hàng sẽ kiểm tra và đổi máy tương đương, kết thúc sớm có hoàn
            tiền, hoặc báo chi phí sửa nếu lỗi phát sinh do quá trình sử dụng. Vui lòng không tự tháo máy.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            if (description.trim().length < MIN_DESCRIPTION) {
              setError(`Vui lòng mô tả lỗi (tối thiểu ${MIN_DESCRIPTION} ký tự)`);
              return;
            }
            mutation.mutate();
          }}
        >
          <div>
            <Label htmlFor="issue-description" className="mb-1.5 block">
              Mô tả lỗi
            </Label>
            <Textarea
              id="issue-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
              rows={4}
              placeholder="VD: máy không lấy nét tự động từ sáng nay, đã thử tắt mở lại vẫn lỗi"
            />
          </div>
          <PhotoPicker
            files={files}
            onChange={setFiles}
            max={MAX_MEDIA}
            allowVideo
            hint={`Tối đa ${MAX_MEDIA} ảnh/video, video ngắn quay lại lỗi giúp xử lý nhanh hơn`}
          />
          {error && <FormErrorBanner message={error} />}
          <Button type="submit" className="w-full" disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="animate-spin" />}
            Gửi báo lỗi
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
