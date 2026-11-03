-- Thông tin in trong hợp đồng thuê (phiên 3/3): số serial, hãng, phụ kiện kèm theo.
ALTER TABLE "devices" ADD COLUMN "serial_number" TEXT,
ADD COLUMN "brand" TEXT,
ADD COLUMN "accessories" JSONB NOT NULL DEFAULT '[]';

-- Backfill cho thiết bị có sẵn — SỐ SERIAL MẪU (dữ liệu demo), cửa hàng thật
-- phải nhập lại đúng số in trên máy ở trang sửa thiết bị.
UPDATE "devices"
SET "serial_number" = 'TR-' || upper(substr(md5("id"), 1, 10))
WHERE "serial_number" IS NULL;

-- Hãng = từ đầu tiên của tên thiết bị (VD "Sony Alpha A7 IV" → "Sony").
UPDATE "devices"
SET "brand" = split_part("name", ' ', 1)
WHERE "brand" IS NULL;

-- Phụ kiện mặc định theo danh mục.
UPDATE "devices" d
SET "accessories" = CASE c."name"
  WHEN 'Laptop' THEN '[{"name":"Bộ sạc (củ + cáp)","quantity":1},{"name":"Túi chống sốc","quantity":1}]'
  WHEN 'Máy ảnh' THEN '[{"name":"Pin","quantity":2},{"name":"Sạc pin","quantity":1},{"name":"Dây đeo","quantity":1},{"name":"Nắp body","quantity":1},{"name":"Thẻ nhớ","quantity":1}]'
  WHEN 'Flycam' THEN '[{"name":"Bộ điều khiển","quantity":1},{"name":"Pin","quantity":3},{"name":"Sạc","quantity":1},{"name":"Cánh quạt dự phòng","quantity":2},{"name":"Túi đựng","quantity":1}]'
  WHEN 'Camera hành động' THEN '[{"name":"Pin","quantity":2},{"name":"Cáp sạc","quantity":1},{"name":"Ngàm gắn","quantity":1},{"name":"Thẻ nhớ","quantity":1}]'
  WHEN 'Gimbal & chống rung' THEN '[{"name":"Cáp sạc","quantity":1},{"name":"Chân tripod mini","quantity":1},{"name":"Túi đựng","quantity":1}]'
  WHEN 'Kính thực tế ảo' THEN '[{"name":"Tay cầm","quantity":2},{"name":"Cáp sạc","quantity":1},{"name":"Củ sạc","quantity":1}]'
  WHEN 'Máy tính bảng' THEN '[{"name":"Bộ sạc (củ + cáp)","quantity":1},{"name":"Ốp bảo vệ","quantity":1}]'
  WHEN 'Màn hình di động' THEN '[{"name":"Cáp USB-C","quantity":1},{"name":"Cáp HDMI","quantity":1},{"name":"Bao da/chân đế","quantity":1}]'
  WHEN 'Máy chiếu' THEN '[{"name":"Dây nguồn","quantity":1},{"name":"Điều khiển từ xa","quantity":1},{"name":"Cáp HDMI","quantity":1}]'
  WHEN 'Máy chơi game' THEN '[{"name":"Tay cầm","quantity":2},{"name":"Dây nguồn","quantity":1},{"name":"Cáp HDMI","quantity":1}]'
  WHEN 'Máy chơi game cầm tay' THEN '[{"name":"Bộ sạc","quantity":1},{"name":"Túi đựng","quantity":1}]'
  WHEN 'Phụ kiện gaming' THEN '[{"name":"Cáp kết nối","quantity":1},{"name":"Hộp đựng","quantity":1}]'
  WHEN 'Thiết bị livestream' THEN '[{"name":"Cáp kết nối","quantity":1},{"name":"Chân đế/ngàm","quantity":1}]'
  WHEN 'Thiết bị mạng' THEN '[{"name":"Bộ nguồn","quantity":1},{"name":"Cáp mạng","quantity":1}]'
  WHEN 'Thiết bị thu âm' THEN '[{"name":"Cáp kết nối","quantity":1},{"name":"Chân/giá đỡ","quantity":1}]'
  WHEN 'Thiết bị âm thanh' THEN '[{"name":"Dây nguồn/cáp sạc","quantity":1},{"name":"Cáp âm thanh","quantity":1}]'
  ELSE '[]'
END::jsonb
FROM "categories" c
WHERE c."id" = d."category_id" AND d."accessories" = '[]'::jsonb;

-- CreateIndex
CREATE UNIQUE INDEX "uq_devices_serial_number" ON "devices"("serial_number");
