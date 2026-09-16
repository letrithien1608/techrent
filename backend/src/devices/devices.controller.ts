import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  MaxFileSizeValidator,
  Param,
  ParseFilePipe,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../generated/prisma/client';
import { UploadService } from '../upload/upload.service';
import { CreateDeviceDto } from './dto/create-device.dto';
import { ListDevicesQueryDto } from './dto/list-devices-query.dto';
import { UpdateDeviceDto } from './dto/update-device.dto';
import { DevicesService } from './devices.service';

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB/ảnh
const MAX_IMAGES_PER_UPLOAD = 8;

@ApiTags('devices')
@Controller('devices')
export class DevicesController {
  constructor(
    private readonly devicesService: DevicesService,
    private readonly uploadService: UploadService,
  ) {}

  @Public()
  @Get()
  findAll(@Query() query: ListDevicesQueryDto) {
    return this.devicesService.findAll({
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      categoryId: query.categoryId,
      status: query.status,
    });
  }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.devicesService.findByIdOrThrow(id);
  }

  @ApiBearerAuth()
  @Roles(Role.admin)
  @Post()
  create(@Body() dto: CreateDeviceDto) {
    return this.devicesService.create(dto);
  }

  @ApiBearerAuth()
  @Roles(Role.admin)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateDeviceDto) {
    return this.devicesService.update(id, dto);
  }

  @ApiBearerAuth()
  @Roles(Role.admin)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.devicesService.remove(id);
  }

  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @Roles(Role.admin)
  @Post(':id/images')
  @UseInterceptors(FilesInterceptor('images', MAX_IMAGES_PER_UPLOAD))
  async uploadImages(
    @Param('id') id: string,
    @UploadedFiles(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: MAX_IMAGE_SIZE_BYTES }),
        ],
      }),
    )
    files: Array<{ buffer: Buffer; mimetype: string }>,
  ) {
    const imageUrls = await this.uploadService.uploadImages(files);
    return this.devicesService.addImages(id, imageUrls);
  }
}
