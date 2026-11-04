import { createHmac } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SocialProvider } from '../../generated/prisma/client';
import {
  SocialOAuthProvider,
  SocialProfile,
  SocialProviderError,
  fetchJson,
} from './social-provider.interface';

// Graph API mới nhất khi viết (changelog Meta, kiểm tra 04/11/2026): v26.0
// (phát hành 29/07/2026). Đổi được qua FACEBOOK_GRAPH_VERSION khi Meta nâng bản.
const DEFAULT_GRAPH_VERSION = 'v26.0';

interface FacebookMe {
  id: string;
  name?: string;
  email?: string;
  picture?: { data?: { url?: string; is_silhouette?: boolean } };
}

/** Manual login flow (developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow). */
@Injectable()
export class FacebookOAuthProvider implements SocialOAuthProvider {
  readonly name = SocialProvider.facebook;

  constructor(private readonly config: ConfigService) {}

  isEnabled(): boolean {
    return !!(
      this.config.get<string>('FACEBOOK_APP_ID') &&
      this.config.get<string>('FACEBOOK_APP_SECRET') &&
      this.config.get<string>('FACEBOOK_CALLBACK_URL')
    );
  }

  private get version(): string {
    return (
      this.config.get<string>('FACEBOOK_GRAPH_VERSION') || DEFAULT_GRAPH_VERSION
    );
  }

  buildAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.get<string>('FACEBOOK_APP_ID')!,
      redirect_uri: this.config.get<string>('FACEBOOK_CALLBACK_URL')!,
      response_type: 'code',
      scope: 'email,public_profile',
      state,
    });
    return `https://www.facebook.com/${this.version}/dialog/oauth?${params.toString()}`;
  }

  async fetchProfile(code: string): Promise<SocialProfile> {
    const appSecret = this.config.get<string>('FACEBOOK_APP_SECRET')!;
    const tokenParams = new URLSearchParams({
      client_id: this.config.get<string>('FACEBOOK_APP_ID')!,
      redirect_uri: this.config.get<string>('FACEBOOK_CALLBACK_URL')!,
      client_secret: appSecret,
      code,
    });
    const token = await fetchJson<{ access_token?: string }>(
      `https://graph.facebook.com/${this.version}/oauth/access_token?${tokenParams.toString()}`,
      {},
      'Facebook token',
    );
    if (!token.access_token) {
      throw new SocialProviderError('Facebook token: thiếu access_token');
    }

    // appsecret_proof: chứng minh lệnh gọi Graph đến từ server có app secret.
    const proof = createHmac('sha256', appSecret)
      .update(token.access_token)
      .digest('hex');
    const meParams = new URLSearchParams({
      fields: 'id,name,email,picture.width(256).height(256)',
      access_token: token.access_token,
      appsecret_proof: proof,
    });
    const me = await fetchJson<FacebookMe>(
      `https://graph.facebook.com/${this.version}/me?${meParams.toString()}`,
      {},
      'Facebook me',
    );
    if (!me.id) {
      throw new SocialProviderError('Facebook me: thiếu id');
    }
    // Facebook chỉ trả `email` khi người dùng có email đã xác nhận và cho phép
    // quyền `email` — có trường email thì coi là đã xác minh.
    return {
      providerUserId: me.id,
      email: me.email ?? null,
      emailVerified: !!me.email,
      name: me.name ?? null,
      // Bỏ qua ảnh bóng xám mặc định của Facebook (người dùng chưa đặt ảnh).
      avatarUrl:
        me.picture?.data?.url && !me.picture.data.is_silhouette
          ? me.picture.data.url
          : null,
    };
  }
}
