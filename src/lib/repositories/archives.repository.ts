import { tokenStore } from '../auth/token';

export type ArchiveListItem = {
  id: string;
  title?: string;
  preview: string;
  tone: string;
  purpose?: string;
  target?: string;
  relationship?: string;
  createdAt: string;
  updatedAt: string;
};

export type ArchiveDetail = ArchiveListItem & {
  content: string;
  rationale?: string;
};

export type ArchivesListQuery = {
  page?: number;
  limit?: number;
  q?: string;
  tone?: string;
  relationship?: string;
  purpose?: string;
  from?: string;
  to?: string;
};

export type ArchivesListResponse = {
  ok: boolean;
  data: {
    items: ArchiveListItem[];
    total: number;
    page: number;
    limit: number;
  };
};

export type ArchiveDetailResponse = {
  ok: boolean;
  data: ArchiveDetail;
};

export interface IArchivesRepository {
  list(query?: ArchivesListQuery): Promise<ArchivesListResponse>;

  get(id: string): Promise<ArchiveDetailResponse>;

  remove(id: string): Promise<{ ok: boolean }>;
}

class ArchivesAPIRepository implements IArchivesRepository {
  private baseUrl = '/api/proxy/v1/archives';

  private async refreshAccessToken(): Promise<string | null> {
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

  private async fetchWithAuth<T = unknown>(
    url: string,
    options: RequestInit = {},
    retryCount = 0,
  ): Promise<T> {
    const accessToken = tokenStore.getAccessToken();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
      credentials: 'include',
    });

    if (!response.ok) {
      if (response.status === 401 && retryCount === 0) {
        console.log('Access token expired, attempting refresh...');

        const newToken = await this.refreshAccessToken();

        if (newToken) {
          console.log('Token refreshed successfully, retrying request...');
          return this.fetchWithAuth(url, options, retryCount + 1);
        }
      }

      const errorData = await response.json().catch(() => null);

      console.error('Archives API Error:', {
        url,
        status: response.status,
        statusText: response.statusText,
        errorData,
        retryCount,
      });

      let userMessage = '요청 처리 중 오류가 발생했습니다.';

      if (response.status === 401) {
        userMessage = '로그인이 필요합니다.';
      } else if (response.status === 403) {
        userMessage = '접근 권한이 없습니다.';
      } else if (response.status === 404) {
        userMessage = '요청한 리소스를 찾을 수 없습니다.';
      } else if (response.status >= 500) {
        userMessage = '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
      } else if (errorData?.error?.message) {
        userMessage = Array.isArray(errorData.error.message)
          ? errorData.error.message.join(', ')
          : errorData.error.message;
      }

      throw new Error(userMessage);
    }

    return response.json();
  }

  async list(query: ArchivesListQuery = {}): Promise<ArchivesListResponse> {
    const params = new URLSearchParams();

    if (query.page) {
      params.set('page', query.page.toString());
    }

    if (query.limit) {
      params.set('limit', query.limit.toString());
    }

    if (query.q) {
      params.set('q', query.q);
    }

    if (query.tone) {
      params.set('tone', query.tone);
    }

    if (query.relationship) {
      params.set('relationship', query.relationship);
    }

    if (query.purpose) {
      params.set('purpose', query.purpose);
    }

    if (query.from) {
      params.set('from', query.from);
    }

    if (query.to) {
      params.set('to', query.to);
    }

    const url = `${this.baseUrl}?${params.toString()}`;
    return this.fetchWithAuth(url);
  }

  async get(id: string): Promise<ArchiveDetailResponse> {
    const url = `${this.baseUrl}/${id}`;
    return this.fetchWithAuth(url);
  }

  async remove(id: string): Promise<{ ok: boolean }> {
    const url = `${this.baseUrl}/${id}`;
    return this.fetchWithAuth(url, { method: 'DELETE' });
  }
}

export const archivesRepository: IArchivesRepository = new ArchivesAPIRepository();
