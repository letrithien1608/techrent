import { ConfigService } from '@nestjs/config';

const sendMailMock = jest.fn();
const createTransportMock = jest.fn(() => ({ sendMail: sendMailMock }));

jest.mock('nodemailer', () => ({
  createTransport: createTransportMock,
}));

// Import sau khi mock 'nodemailer' để MailService dùng đúng bản mock
import { MailService } from './mail.service';

describe('MailService', () => {
  let service: MailService;
  const configValues: Record<string, string> = {
    EMAIL_FROM: 'TechRent <no-reply@techrent.local>',
    SMTP_HOST: 'smtp.gmail.com',
    SMTP_PORT: '587',
    SMTP_USER: 'user@gmail.com',
    SMTP_PASSWORD: 'app-password',
  };

  beforeEach(() => {
    sendMailMock.mockReset();
    createTransportMock.mockClear();
    const configService = {
      get: jest.fn((key: string) => configValues[key]),
    } as unknown as ConfigService;
    service = new MailService(configService);
  });

  it('khởi tạo transporter SMTP với đúng host/port/auth từ ConfigService', () => {
    expect(createTransportMock).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'smtp.gmail.com',
        port: 587,
        auth: { user: 'user@gmail.com', pass: 'app-password' },
      }),
    );
  });

  it('gửi email xác thực với đúng người nhận, chủ đề, và link chứa trong nội dung', async () => {
    sendMailMock.mockResolvedValue({ messageId: '123' });

    await service.sendVerificationEmail(
      'target@example.com',
      'Nguyễn Văn A',
      'http://localhost:3001/auth/verify-email?token=abc123',
    );

    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: configValues.EMAIL_FROM,
        to: 'target@example.com',
        subject: expect.any(String),
        html: expect.stringContaining(
          'http://localhost:3001/auth/verify-email?token=abc123',
        ),
      }),
    );
  });

  it('không throw ra ngoài nếu gửi email thất bại (chỉ log lỗi)', async () => {
    sendMailMock.mockRejectedValue(new Error('SMTP connection failed'));

    await expect(
      service.sendVerificationEmail('target@example.com', 'A', 'http://x'),
    ).resolves.toBeUndefined();
  });
});
