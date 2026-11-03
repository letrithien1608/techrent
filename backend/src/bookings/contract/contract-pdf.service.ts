import {
  Injectable,
  Logger,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync } from 'fs';
import { chromium, type Browser } from 'playwright-core';

// Chrome/Chromium có sẵn trên máy chủ — ghi đè bằng PDF_BROWSER_PATH.
const DEFAULT_BROWSER_PATHS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];
const RENDER_TIMEOUT_MS = 30_000;

/**
 * Sinh PDF hợp đồng phía server bằng Chromium headless (playwright-core, dùng
 * trình duyệt có sẵn — không tải kèm browser). PDF sạch: không header/footer
 * của trình duyệt (ngày giờ, URL, tiêu đề tab), khổ A4 và lề theo `@page`
 * trong HTML. Trình duyệt mở 1 lần, dùng lại cho các lần sau.
 */
@Injectable()
export class ContractPdfService implements OnModuleDestroy {
  private readonly logger = new Logger(ContractPdfService.name);
  private browser: Promise<Browser> | null = null;

  constructor(private readonly configService: ConfigService) {}

  private resolveExecutable(): string {
    const configured = this.configService.get<string>('PDF_BROWSER_PATH');
    const found = [configured, ...DEFAULT_BROWSER_PATHS].find(
      (path): path is string => !!path && existsSync(path),
    );
    if (!found) {
      throw new ServiceUnavailableException(
        'Máy chủ chưa có Chrome/Chromium để tạo PDF — đặt PDF_BROWSER_PATH hoặc dùng nút In',
      );
    }
    return found;
  }

  private getBrowser(): Promise<Browser> {
    if (!this.browser) {
      this.browser = chromium
        .launch({ executablePath: this.resolveExecutable(), headless: true })
        .catch((error: Error) => {
          this.browser = null;
          throw error;
        });
    }
    return this.browser;
  }

  async render(html: string): Promise<Buffer> {
    const browser = await this.getBrowser();
    const page = await browser.newPage();
    try {
      await page.setContent(html, {
        waitUntil: 'networkidle',
        timeout: RENDER_TIMEOUT_MS,
      });
      // Chờ font nhúng tải xong trước khi in (tránh PDF dùng font dự phòng).
      await page.evaluate('document.fonts.ready');
      return await page.pdf({
        format: 'A4',
        preferCSSPageSize: true,
        printBackground: true,
        displayHeaderFooter: false,
      });
    } finally {
      await page.close();
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.browser) return;
    try {
      await (await this.browser).close();
    } catch (error) {
      this.logger.warn(
        `Không đóng được trình duyệt PDF: ${(error as Error).message}`,
      );
    }
  }
}
