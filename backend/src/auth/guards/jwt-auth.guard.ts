import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_OPTIONAL_AUTH_KEY } from '../decorators/optional-auth.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const targets = [context.getHandler(), context.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      IS_PUBLIC_KEY,
      targets,
    );
    if (isPublic) return true;
    const isOptional = this.reflector.getAllAndOverride<boolean>(
      IS_OPTIONAL_AUTH_KEY,
      targets,
    );
    if (isOptional) return this.authenticateIfPossible(context);
    return super.canActivate(context);
  }

  /** @OptionalAuth(): thử xác thực, lỗi thì vẫn cho qua dưới dạng khách (req.user không có). */
  private async authenticateIfPossible(
    context: ExecutionContext,
  ): Promise<boolean> {
    try {
      await super.canActivate(context);
    } catch {
      // Token thiếu/sai/hết hạn/đã thu hồi — coi là khách vãng lai.
    }
    return true;
  }
}
