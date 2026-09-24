"use client";

import { useEffect, useRef } from "react";
import {
  getRealtimeSocket,
  type DeviceStatusChangedPayload,
} from "@/lib/realtime-socket";

/**
 * Lắng nghe event `device:status-changed` từ backend (bắn ra khi
 * BookingsService.start()/complete(), MaintenanceService, hoặc admin đổi
 * status thiết bị tay qua PATCH /devices/:id — xem CLAUDE.md mục Tuần 8).
 *
 * Dùng `ref` giữ callback MỚI NHẤT thay vì đưa thẳng `onStatusChanged` vào
 * mảng dependency của effect đăng ký/gỡ listener — nếu không, mỗi lần
 * component cha re-render với 1 hàm callback MỚI (khác identity dù cùng nội
 * dung, rất dễ xảy ra nếu caller không tự `useCallback`) sẽ khiến effect
 * chạy lại, gỡ rồi đăng ký lại listener liên tục không cần thiết. Cách này
 * đảm bảo chỉ đăng ký/gỡ đúng 1 lần theo vòng đời mount/unmount của
 * component, đồng thời vẫn luôn gọi callback bản mới nhất.
 */
export function useDeviceStatusRealtime(
  onStatusChanged: (payload: DeviceStatusChangedPayload) => void,
): void {
  const handlerRef = useRef(onStatusChanged);

  useEffect(() => {
    handlerRef.current = onStatusChanged;
  }, [onStatusChanged]);

  useEffect(() => {
    const socket = getRealtimeSocket();
    const listener = (payload: DeviceStatusChangedPayload) => {
      handlerRef.current(payload);
    };
    socket.on("device:status-changed", listener);
    return () => {
      socket.off("device:status-changed", listener);
    };
  }, []);
}
