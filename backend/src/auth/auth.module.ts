import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerGuard, ThrottlerModule, minutes } from '@nestjs/throttler';
import { MailModule } from '../mail/mail.module';
import { UploadModule } from '../upload/upload.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    UsersModule,
    PassportModule,
    JwtModule.register({}),
    MailModule,
    // UploadModule là module "lá" (xem mục 2 CLAUDE.md) — AuthService cần nó
    // để upload 3 ảnh KYC (PATCH /auth/kyc-verification), không rủi ro cycle.
    UploadModule,
    // Cấu hình ThrottlerModule ngay tại đây (module khai báo ThrottlerGuard) để
    // ThrottlerGuard resolve được token ThrottlerStorage/Options — nếu cấu hình
    // ở module khác (VD AppModule) thì AuthModule sẽ không thấy được provider đó.
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: minutes(1),
        limit: 100,
        // Rate limit theo user đã đăng nhập (không phải theo IP) — mục 7 Roadmap.
        // JwtAuthGuard chạy trước ThrottlerGuard (xem thứ tự APP_GUARD bên dưới)
        // nên req.user đã có sẵn khi ThrottlerGuard chạy.
        getTracker: (req) => req.user?.userId ?? req.ip,
        // CHỈ khi kiểm thử tải bằng k6 (load-tests/): k6 bắn từ 1 IP nên mọi
        // request công khai sẽ dính giới hạn 100/phút. Mặc định (không đặt
        // biến) rate limit giữ nguyên. Đọc lúc chạy request, không phải lúc import.
        skipIf: () => process.env.LOAD_TEST === 'true',
      },
    ]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    // Thứ tự guard toàn cục CÓ Ý NGHĨA: JwtAuthGuard chạy trước để gán req.user,
    // rồi mới tới RolesGuard/ThrottlerGuard (ThrottlerGuard cần req.user để rate
    // limit theo user thay vì theo IP — xem getTracker trong AppModule). Cả 3 khai
    // báo chung 1 module để đảm bảo thứ tự chạy đúng như liệt kê (Nest áp guard
    // toàn cục theo đúng thứ tự provider trong mảng).
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
  exports: [AuthService],
})
export class AuthModule {}
