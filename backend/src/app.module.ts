import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { BookingsModule } from './bookings/bookings.module';
import { CategoriesModule } from './categories/categories.module';
import { DevicesModule } from './devices/devices.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { UploadModule } from './upload/upload.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        // Kết nối Redis riêng cho BullMQ (không dùng chung RedisService của blacklist)
        // vì BullMQ yêu cầu maxRetriesPerRequest: null cho các lệnh blocking nội bộ.
        connection: new Redis(
          config.get<string>('REDIS_URL') ?? 'redis://localhost:6379',
          {
            maxRetriesPerRequest: null,
          },
        ),
      }),
    }),
    PrismaModule,
    RedisModule,
    UsersModule,
    AuthModule,
    UploadModule,
    CategoriesModule,
    DevicesModule,
    BookingsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
