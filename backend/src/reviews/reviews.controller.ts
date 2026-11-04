import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, hours } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequestUser } from '../auth/interfaces/jwt-payload.interface';
import { Role } from '../generated/prisma/client';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import { SetReviewVisibilityDto } from './dto/set-review-visibility.dto';
import { ModeratorDeleteReviewDto } from './dto/moderator-delete-review.dto';
import {
  ListAdminReviewsQueryDto,
  ListReviewsQueryDto,
  ReviewDeviceQueryDto,
} from './dto/list-reviews-query.dto';
import { ReviewsService } from './reviews.service';

@ApiTags('reviews')
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Public()
  @Get()
  findAll(@Query() query: ListReviewsQueryDto) {
    return this.reviewsService.findPublic({
      page: query.page ?? 1,
      limit: query.limit ?? 10,
      deviceId: query.deviceId,
      sort: query.sort,
      rating: query.rating,
      rentedOnly: query.rentedOnly,
    });
  }

  @Public()
  @Get('summary')
  summary(@Query() query: ReviewDeviceQueryDto) {
    return this.reviewsService.getSummary(query.deviceId);
  }

  @Public()
  @Get('featured')
  featured() {
    return this.reviewsService.findFeatured(6);
  }

  @ApiBearerAuth()
  @Roles(Role.staff, Role.admin)
  @Get('admin')
  findForAdmin(@Query() query: ListAdminReviewsQueryDto) {
    return this.reviewsService.findForAdmin({
      page: query.page ?? 1,
      limit: query.limit ?? 10,
      deviceId: query.deviceId,
      sort: query.sort,
      rating: query.rating,
      status: query.status,
      search: query.search,
    });
  }

  @ApiBearerAuth()
  // Chống spam: tối đa 5 lần gửi/sửa đánh giá mỗi giờ cho mỗi tài khoản (ngoài
  // giới hạn REVIEW_EDITS_PER_DAY lần sửa/đánh giá/ngày ở service).
  @Throttle({ default: { limit: 5, ttl: hours(1) } })
  @Patch(':id')
  update(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateReviewDto,
  ) {
    return this.reviewsService.update(user.userId, id, dto);
  }

  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Khách tự xoá đánh giá của mình (xoá hẳn, được viết lại)',
  })
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.reviewsService.remove(user.userId, id);
  }

  @ApiBearerAuth()
  @Roles(Role.staff, Role.admin)
  @Patch(':id/visibility')
  setVisibility(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetReviewVisibilityDto,
  ) {
    return this.reviewsService.setVisibility(id, user.userId, dto);
  }

  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Staff/admin xoá đánh giá vi phạm (xoá mềm, bắt buộc lý do)',
  })
  @Roles(Role.staff, Role.admin)
  @Post(':id/moderator-delete')
  @HttpCode(HttpStatus.OK)
  moderatorDelete(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ModeratorDeleteReviewDto,
  ) {
    return this.reviewsService.moderatorDelete(id, user.userId, dto.reason);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin khôi phục đánh giá đã bị xoá' })
  @Roles(Role.admin)
  @Post(':id/restore')
  @HttpCode(HttpStatus.OK)
  restore(@Param('id', ParseUUIDPipe) id: string) {
    return this.reviewsService.restore(id);
  }
}

/** Viết đánh giá + lấy đánh giá của chính mình, theo từng thiết bị. */
@ApiTags('reviews')
@ApiBearerAuth()
@Controller('devices/:deviceId/reviews')
export class DeviceReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @ApiOperation({
    summary:
      'Viết đánh giá (khách đã đăng nhập, 1 đánh giá/thiết bị — trùng → 409)',
  })
  @Throttle({ default: { limit: 5, ttl: hours(1) } })
  @Post()
  create(
    @CurrentUser() user: RequestUser,
    @Param('deviceId', ParseUUIDPipe) deviceId: string,
    @Body() dto: CreateReviewDto,
  ) {
    return this.reviewsService.create(user.userId, deviceId, dto);
  }

  @ApiOperation({
    summary: 'Đánh giá của tôi cho thiết bị + quyền viết/sửa',
  })
  @Get('me')
  mine(
    @CurrentUser() user: RequestUser,
    @Param('deviceId', ParseUUIDPipe) deviceId: string,
  ) {
    return this.reviewsService.getMine(user.userId, deviceId);
  }
}
