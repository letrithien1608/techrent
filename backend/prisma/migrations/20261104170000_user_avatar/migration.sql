-- Ảnh đại diện công khai của tài khoản (Cloudinary techrent/avatars).
ALTER TABLE "users" ADD COLUMN "avatar_public_id" TEXT;
ALTER TABLE "users" ADD COLUMN "avatar_url" TEXT;
