import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SocialProvider } from '../../generated/prisma/client';
import {
  SocialOAuthProvider,
  SocialProfile,
  SocialProviderError,
  fetchJson,
} from './social-provider.interface';

// Tài liệu: developers.google.com/identity/protocols/oauth2/web-server và
// .../openid-connect/openid-connect (kiểm tra 04/11/2026).
const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';

interface GoogleUserInfo {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
}

/** Tự viết (không dùng passport) — state/ticket do `SocialAuthService` quản lý trên Redis. */
@Injectable()
export class GoogleOAuthProvider implements SocialOAuthProvider {
  readonly name = SocialProvider.google;

  constructor(private readonly config: ConfigService) {}

  isEnabled(): boolean {
    return !!(
      this.config.get<string>('GOOGLE_CLIENT_ID') &&
      this.config.get<string>('GOOGLE_CLIENT_SECRET') &&
      this.config.get<string>('GOOGLE_CALLBACK_URL')
    );
  }

  buildAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.get<string>('GOOGLE_CLIENT_ID')!,
      redirect_uri: this.config.get<string>('GOOGLE_CALLBACK_URL')!,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      prompt: 'select_account',
    });
    return `${AUTHORIZE_URL}?${params.toString()}`;
  }

  async fetchProfile(code: string): Promise<SocialProfile> {
    const token = await fetchJson<{ access_token?: string }>(
      TOKEN_URL,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: this.config.get<string>('GOOGLE_CLIENT_ID')!,
          client_secret: this.config.get<string>('GOOGLE_CLIENT_SECRET')!,
          redirect_uri: this.config.get<string>('GOOGLE_CALLBACK_URL')!,
          grant_type: 'authorization_code',
        }).toString(),
      },
      'Google token',
    );
    if (!token.access_token) {
      throw new SocialProviderError('Google token: thiếu access_token');
    }

    const info = await fetchJson<GoogleUserInfo>(
      USERINFO_URL,
      { headers: { Authorization: `Bearer ${token.access_token}` } },
      'Google userinfo',
    );
    if (!info.sub) {
      throw new SocialProviderError('Google userinfo: thiếu sub');
    }
    return {
      providerUserId: info.sub,
      email: info.email ?? null,
      emailVerified: info.email_verified === true && !!info.email,
      name: info.name ?? null,
    };
  }
}
