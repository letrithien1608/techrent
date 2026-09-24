"use client";

import { useEffect, useRef } from "react";
import {
  getRealtimeSocket,
  type NotificationCreatedPayload,
} from "@/lib/realtime-socket";

/**
 * Lắng nghe event `notification:created` — CHỈ tới đúng client đã
 * `notifications:authenticate` thành công với đúng userId (server dùng room
 * `user:${userId}`, xem `RealtimeGateway`), KHÁC hẳn `useDeviceStatusRealtime`
 * (broadcast toàn cục ai cũng nhận). Dùng chung 1 kết nối socket singleton
 * (`getRealtimeSocket()`) — không tạo socket riêng cho notification.
 *
 * Cùng pattern `useRef` giữ callback mới nhất như `useDeviceStatusRealtime` —
 * xem giải thích đầy đủ ở đó.
 */
export function useNotificationRealtime(
  onNotificationCreated: (payload: NotificationCreatedPayload) => void,
): void {
  const handlerRef = useRef(onNotificationCreated);

  useEffect(() => {
    handlerRef.current = onNotificationCreated;
  }, [onNotificationCreated]);

  useEffect(() => {
    const socket = getRealtimeSocket();
    const listener = (payload: NotificationCreatedPayload) => {
      handlerRef.current(payload);
    };
    socket.on("notification:created", listener);
    return () => {
      socket.off("notification:created", listener);
    };
  }, []);
}
