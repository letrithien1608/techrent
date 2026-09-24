import { io, type Socket } from "socket.io-client";
import type { DeviceStatus } from "@/lib/devices-api";

export interface DeviceStatusChangedPayload {
  deviceId: string;
  status: DeviceStatus;
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
    socket = io(WS_URL, { autoConnect: true, reconnection: true });
  }
  return socket;
}
