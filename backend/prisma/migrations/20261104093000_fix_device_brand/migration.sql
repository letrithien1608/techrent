-- Backfill "hãng = từ đầu tiên của tên" sai với các dòng máy mang tên sản phẩm.
UPDATE "devices" SET "brand" = 'Apple' WHERE "brand" IN ('MacBook', 'iPad', 'iPhone');
UPDATE "devices" SET "brand" = 'Sony' WHERE "brand" = 'PlayStation';
UPDATE "devices" SET "brand" = 'Valve' WHERE "brand" = 'Steam';
UPDATE "devices" SET "brand" = 'Microsoft' WHERE "brand" = 'Xbox';
