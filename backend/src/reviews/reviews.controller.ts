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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle, hours } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequestUser } from '../auth/interfaces/jwt-payload.interface';
import { Role } from '../generated/prisma/client';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import { SetReviewVisibilityDto } from './dto/set-review-visibility.dto';
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
  @Get('me')
  mine(@CurrentUser() user: RequestUser, @Query() query: ReviewDeviceQueryDto) {
    return this.reviewsService.getEligibility(user.userId, query.deviceId);
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
      hidden: query.hidden,
      search: query.search,
    });
  }

  @ApiBearerAuth()
  // Chống spam: tối đa 5 lần gửi/sửa đánh giá mỗi giờ cho mỗi tài khoản.
  @Throttle({ default: { limit: 5, ttl: hours(1) } })
  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateReviewDto) {
    return this.reviewsService.create(user.userId, dto);
  }

  @ApiBearerAuth()
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
}
