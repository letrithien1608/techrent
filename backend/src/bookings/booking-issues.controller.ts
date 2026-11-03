import {
  Body,
  Controller,
  Get,
  MaxFileSizeValidator,
  Param,
  ParseFilePipe,
  Post,
  Query,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Throttle, minutes } from '@nestjs/throttler';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequestUser } from '../auth/interfaces/jwt-payload.interface';
import { Role } from '../generated/prisma/client';
import { BookingIssuesService } from './booking-issues.service';
import { ListIssuesQueryDto } from './dto/list-issues-query.dto';
import { ReportIssueDto } from './dto/report-issue.dto';
import { ResolveIssueDto } from './dto/resolve-issue.dto';

const MAX_ISSUE_MEDIA = 5;
// Video quay lỗi có thể vài chục MB.
const MAX_ISSUE_MEDIA_BYTES = 30 * 1024 * 1024;
const MAX_SWAP_IMAGES = 10;
const MAX_SWAP_IMAGE_BYTES = 8 * 1024 * 1024;

@ApiTags('issue-reports')
@ApiBearerAuth()
@Controller()
export class BookingIssuesController {
  constructor(private readonly issuesService: BookingIssuesService) {}

  // Khách báo lỗi từ đơn đang thuê của chính mình (kiểm tra chủ đơn ở service).
  @Throttle({ default: { limit: 5, ttl: minutes(10) } })
  @Post('bookings/:id/issues')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('media', MAX_ISSUE_MEDIA))
  report(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: ReportIssueDto,
    @UploadedFiles(
      new ParseFilePipe({
        fileIsRequired: false,
        validators: [
          new MaxFileSizeValidator({ maxSize: MAX_ISSUE_MEDIA_BYTES }),
        ],
      }),
    )
    files: Express.Multer.File[] = [],
  ) {
    return this.issuesService.report(id, user, dto.description, files);
  }

  @Roles(Role.staff, Role.admin)
  @Get('bookings/:id/replacement-candidates')
  replacementCandidates(@Param('id') id: string) {
    return this.issuesService.findReplacementCandidates(id);
  }

  @Roles(Role.staff, Role.admin)
  @Get('issue-reports')
  findAll(@Query() query: ListIssuesQueryDto) {
    return this.issuesService.findAll({
      status: query.status,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    });
  }

  @Roles(Role.staff, Role.admin)
  @Get('issue-reports/:id')
  findOne(@Param('id') id: string) {
    return this.issuesService.findOne(id);
  }

  @Roles(Role.staff, Role.admin)
  @Post('issue-reports/:id/resolve')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('images', MAX_SWAP_IMAGES))
  resolve(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: ResolveIssueDto,
    @UploadedFiles(
      new ParseFilePipe({
        fileIsRequired: false,
        validators: [
          new MaxFileSizeValidator({ maxSize: MAX_SWAP_IMAGE_BYTES }),
        ],
      }),
    )
    files: Express.Multer.File[] = [],
  ) {
    return this.issuesService.resolve(id, user.userId, dto, files);
  }
}
