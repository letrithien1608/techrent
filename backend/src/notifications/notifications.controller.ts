import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequestUser } from '../auth/interfaces/jwt-payload.interface';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';
import { NotificationsService } from './notifications.service';

// Không có @Roles() riêng — mọi role đã đăng nhập (customer/staff/admin) đều
// chỉ xem/thao tác ĐÚNG thông báo của chính mình (lấy userId từ token qua
// @CurrentUser(), KHÔNG nhận userId từ client) — không cần phân quyền thêm.
@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  findAll(
    @CurrentUser() user: RequestUser,
    @Query() query: ListNotificationsQueryDto,
  ) {
    return this.notificationsService.findAllForUser(user.userId, {
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      isRead: query.isRead,
      types: query.types,
    });
  }

  // Đặt route tĩnh "read-all" TRƯỚC route động ":id/read" — dù 2 shape khác
  // segment count nên thực ra không đụng nhau, vẫn theo đúng quy ước an toàn
  // "route tĩnh trước route có tham số" cho dễ đọc/không bất ngờ về sau.
  @Patch('read-all')
  markAllAsRead(@CurrentUser() user: RequestUser) {
    return this.notificationsService.markAllAsRead(user.userId);
  }

  @Patch(':id/read')
  markAsRead(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.notificationsService.markAsRead(id, user.userId);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    await this.notificationsService.remove(id, user.userId);
  }
}
