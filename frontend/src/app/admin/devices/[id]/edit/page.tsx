import { EditDeviceView } from "@/components/admin/edit-device-view";

interface PageParams {
  params: Promise<{ id: string }>;
}

export default async function EditDevicePage({ params }: PageParams) {
  const { id } = await params;
  return <EditDeviceView deviceId={id} />;
}
