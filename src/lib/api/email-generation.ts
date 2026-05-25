import { tokenStore } from '../auth/token';

export type GenerateEmailRequest = {
  draft: string;
  language: 'ko' | 'en';
  relationship?: string;
  purpose?: string;
  tone?: string;
  length?: 'short' | 'medium' | 'long';
  includeRationale?: boolean;
  previousEmail?: string;
  refinementFeedback?: string;
};

export type GenerateEmailResponse = {
  ok: boolean;
  data: {
    email: string;
    rationale?: string;
    appliedFilters: {
      language: 'ko' | 'en';
      relationship?: string;
      purpose?: string;
      tone?: string;
      length?: string;
    };
    metadata: {
      charactersUsed: number;
      tokensUsed: number;
      creditCharged: number;
      remainingCredits?: number;
    };
  };
};

async function refreshAccessToken(): Promise<string | null> {
  try {
    const response = await fetch('/api/auth/refresh', { method: 'POST' });
    const data = await response.json();

    if (response.ok && data?.data?.accessToken) {
      const newToken = data.data.accessToken;
      tokenStore.setAccessToken(newToken);
      return newToken;
    }
  } catch (error) {
    console.error('Token refresh failed:', error);
  }
  return null;
}

export async function generateEmail(
  request: GenerateEmailRequest,
  retryCount = 0,
): Promise<GenerateEmailResponse> {
  const accessToken = tokenStore.getAccessToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  // Next.js API route를 통해 백엔드 호출 (HTTPS 문제 해결)
  const response = await fetch('/api/ai/generate-email', {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    if (response.status === 401 && retryCount === 0) {
      const newToken = await refreshAccessToken();

      if (newToken) {
        return generateEmail(request, retryCount + 1);
      }
    }

    const error = await response.json().catch(() => null);
    const backendError = error?.error;
    const details = backendError?.details ?? error?.details;
    const message = backendError?.message ?? error?.message;

    const errorMessage = Array.isArray(details)
      ? details.join(', ')
      : typeof details === 'string'
        ? details
        : Array.isArray(message)
          ? message.join(', ')
          : message || '이메일 생성 중 오류가 발생했습니다.';

    throw new Error(errorMessage);
  }

  return response.json();
}
