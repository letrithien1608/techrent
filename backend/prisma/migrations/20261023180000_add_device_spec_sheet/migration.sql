-- Thông số kỹ thuật có cấu trúc: danh sách {group, label, value} theo đúng
-- mẫu của danh mục. Cột `specs` cũ (JSON tự do key-value) giữ nguyên để không
-- phá dữ liệu cũ; `detailed_description` cũng giữ nguyên.
ALTER TABLE "devices" ADD COLUMN "spec_sheet" JSONB;

-- Mẫu thông số theo danh mục: danh sách {group, fields: [label]} — form admin
-- dựng ô nhập từ đây, trang chi tiết nhóm bảng thông số theo đúng thứ tự này.
ALTER TABLE "categories" ADD COLUMN "spec_template" JSONB;
