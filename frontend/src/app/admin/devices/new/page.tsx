import { AdminBackButton } from "@/components/admin/admin-back-button";
import { DeviceForm } from "@/components/admin/device-form";

export default function NewDevicePage() {
  return (
    <div>
      <AdminBackButton href="/admin/devices" label="Quay lại danh sách thiết bị" />
      <DeviceForm />
    </div>
  );
}
