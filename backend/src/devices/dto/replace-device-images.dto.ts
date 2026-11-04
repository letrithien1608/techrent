import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsUrl,
} from 'class-validator';
import { MIN_DEVICE_IMAGES } from './create-device.dto';

/**
 * Lưu bộ ảnh thiết bị đã sắp xếp (form "Sửa ảnh thiết bị"): `images[0]` là
 * ảnh đại diện. Ảnh mới phải tải trước qua `POST /devices/images/upload`.
 */
export class ReplaceDeviceImagesDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(MIN_DEVICE_IMAGES, {
    message: `Thiết bị cần tối thiểu ${MIN_DEVICE_IMAGES} ảnh`,
  })
  @ArrayMaxSize(30)
  @IsUrl({ protocols: ['https'], require_protocol: true }, { each: true })
  images: string[];

  /** Ảnh đã tải lên trong phiên sửa nhưng bị bỏ trước khi lưu — server xoá luôn trên Cloudinary. */
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUrl({ protocols: ['https'], require_protocol: true }, { each: true })
  discardedUploads?: string[];
}
