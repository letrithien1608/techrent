-- Đăng nhập bằng Google/Facebook: tài khoản mạng xã hội có thể chưa có mật khẩu.
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;

CREATE TYPE "SocialProvider" AS ENUM ('google', 'facebook');

CREATE TABLE "social_accounts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider" "SocialProvider" NOT NULL,
    "provider_user_id" TEXT NOT NULL,
    "email" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "social_accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "idx_social_accounts_provider_user" ON "social_accounts"("provider", "provider_user_id");
CREATE UNIQUE INDEX "idx_social_accounts_user_provider" ON "social_accounts"("user_id", "provider");

ALTER TABLE "social_accounts" ADD CONSTRAINT "social_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
