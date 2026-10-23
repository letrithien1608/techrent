import { io, type Socket } from "socket.io-client";
import type { DeviceStatus } from "@/lib/devices-api";
import { useAuthStore } from "@/stores/auth-store";

export interface DeviceStatusChangedPayload {
  deviceId: string;
  status: DeviceStatus;
}

export interface NotificationCreatedPayload {
  id: string;
  type: string;
  title: string | null;
  message: string;
  link: string | null;
  metadata: unknown;
  isRead: boolean;
  createdAt: string;
}

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "http://localhost:3001";

// Singleton — 1 kết nối socket.io DUY NHẤT dùng chung cho toàn app, tạo lười
// (lazy) ở lần gọi đầu tiên. KHÔNG tạo 1 socket mới mỗi lần 1 component mount
// (VD mỗi lần vào lại /devices) — vừa tốn 1 vòng bắt tay WebSocket mới không
// cần thiết, vừa dễ để sót nhiều kết nối chồng chất nếu quên đóng đúng cách.
// Các component chỉ cần gỡ LISTENER của riêng mình lúc unmount (xem
// `useDeviceStatusRealtime`) — đó mới là phần thực sự "leak" nếu bỏ sót
// (tích luỹ handler trùng lặp qua nhiều lần mount/unmount), không phải bản
// thân kết nối transport. socket.io tự đóng kết nối khi tab trình duyệt đóng.
let socket: Socket | null = null;

export function getRealtimeSocket(): Socket {
  if (!socket) {
    socket = io(WS_URL, {
      autoConnect: true,
      reconnection: true,
      // Hàm (không phải object tĩnh) — socket.io-client gọi lại hàm này MỖI
      // LẦN (re)connect, nên luôn lấy đúng access token MỚI NHẤT từ Zustand
      // store tại đúng thời điểm bắt tay (phủ cả trường hợp hard reload đã
      // đăng nhập sẵn, VÀ trường hợp reconnect sau khi access token đã được
      // refresh) — xem `RealtimeGateway.handleConnection()` phía backend.
      auth: (callback) =>
        callback({ token: useAuthStore.getState().accessToken ?? undefined }),
    });

    // Trường hợp KHÔNG reconnect (đăng nhập/đăng xuất ngay trong 1 phiên kết
    // nối WebSocket đang mở — phổ biến nhất) — option `auth` ở trên chỉ gửi
    // lại lúc (re)connect, không tự cập nhật giữa chừng. Nghe thẳng thay đổi
    // `accessToken` trên store rồi báo cho server qua 2 event tương ứng, để
    // gateway join/leave đúng room `user:${userId}` (xem mục 2 CLAUDE.md).
    useAuthStore.subscribe((state, prevState) => {
      if (state.accessToken === prevState.accessToken) return;
      if (state.accessToken) {
        socket?.emit("notifications:authenticate", { token: state.accessToken });
      } else {
        socket?.emit("notifications:logout");
      }
    });
  }
  return socket;
}
