import { Module } from '@nestjs/common';
import { aiConfigProvider } from './ai.config';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { KnowledgeService } from './knowledge.service';
import { OllamaClient } from './ollama.client';

/**
 * Trợ lý AI chạy LLM local qua Ollama. Module "lá": chỉ dùng PrismaService/
 * ConfigService (global) để đọc thiết bị công khai, KHÔNG import module nghiệp
 * vụ nào khác và không module nào import ngược lại — không có rủi ro import cycle.
 */
@Module({
  controllers: [AiController],
  providers: [aiConfigProvider, OllamaClient, KnowledgeService, AiService],
})
export class AiModule {}
