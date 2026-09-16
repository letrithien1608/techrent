import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: nodemailer.Transporter;
  private readonly from: string;

  constructor(private readonly configService: ConfigService) {
    this.from =
      this.configService.get<string>('EMAIL_FROM') ??
      'TechRent <no-reply@techrent.local>';
    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('SMTP_HOST'),
      port: Number(this.configService.get<string>('SMTP_PORT') ?? 587),
      secure: false,
      auth: {
        user: this.configService.get<string>('SMTP_USER'),
        pass: this.configService.get<string>('SMTP_PASSWORD'),
      },
    });
  }

  async sendVerificationEmail(
    to: string,
    name: string,
    verificationUrl: string,
  ): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: this.from,
        to,
        subject: 'Xác thực email tài khoản TechRent',
        html: `
          <p>Chào ${name},</p>
          <p>Cảm ơn bạn đã đăng ký tài khoản TechRent. Vui lòng bấm vào liên kết dưới đây để xác thực email (liên kết có hiệu lực trong 24 giờ):</p>
          <p><a href="${verificationUrl}">${verificationUrl}</a></p>
          <p>Nếu bạn không tạo tài khoản này, hãy bỏ qua email này.</p>
        `,
      });
    } catch (error) {
      this.logger.error(
        `Gửi email xác thực tới ${to} thất bại: ${(error as Error).message}`,
      );
    }
  }
}
