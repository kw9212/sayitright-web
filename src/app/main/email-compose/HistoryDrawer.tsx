'use client';

import { useState, useEffect, useCallback } from 'react';
import { archivesRepository } from '@/lib/repositories/archives.repository';
import { guestArchivesRepository } from '@/lib/repositories/guest-archives.repository';
import type { ArchiveListItem } from '@/lib/repositories/archives.repository';

interface LoadedHistory {
  content: string;
  rationale?: string;
  tone?: string;
  relationship?: string;
  purpose?: string;
}

interface HistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onLoad: (history: LoadedHistory) => void;
  isGuest: boolean;
}

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return '방금 전';
  if (diffMin < 60) return `${diffMin}분 전`;
  if (diffHour < 24) return `${diffHour}시간 전`;
  if (diffDay < 7) return `${diffDay}일 전`;
  return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}

export default function HistoryDrawer({ isOpen, onClose, onLoad, isGuest }: HistoryDrawerProps) {
  const [items, setItems] = useState<ArchiveListItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const repo = isGuest ? guestArchivesRepository : archivesRepository;
      const response = await repo.list({ page: 1, limit: 10 });
      setItems(response.data.items);
    } catch {
      setError('기록을 불러오지 못했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, [isGuest]);

  useEffect(() => {
    if (isOpen) {
      void fetchHistory();
    }
  }, [isOpen, fetchHistory]);

  const handleLoad = async (item: ArchiveListItem) => {
    setLoadingId(item.id);
    try {
      const repo = isGuest ? guestArchivesRepository : archivesRepository;
      const response = await repo.get(item.id);
      onLoad({
        content: response.data.content,
        rationale: response.data.rationale,
        tone: item.tone,
        relationship: item.relationship,
        purpose: item.purpose,
      });
      onClose();
    } catch {
      setError('이메일을 불러오지 못했습니다.');
    } finally {
      setLoadingId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} aria-hidden="true" />

      <div className="fixed right-0 top-0 z-50 h-full w-full max-w-sm bg-zinc-900 border-l border-zinc-800 flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div>
            <h2 className="font-semibold text-zinc-100">최근 생성 기록</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              {isGuest ? '최근 7일 · 최대 10개' : '최근 기록 불러오기'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-200 transition-colors p-1"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <div className="flex items-center justify-center h-40 text-zinc-500 text-sm">
              불러오는 중...
            </div>
          )}

          {error && !isLoading && (
            <div className="p-5 text-center">
              <p className="text-sm text-red-400">{error}</p>
              <button
                onClick={() => void fetchHistory()}
                className="mt-3 text-xs text-zinc-400 hover:text-zinc-200 underline"
              >
                다시 시도
              </button>
            </div>
          )}

          {!isLoading && !error && items.length === 0 && (
            <div className="flex flex-col items-center justify-center h-40 text-zinc-500">
              <div className="text-3xl mb-2">📭</div>
              <p className="text-sm">생성된 이메일 기록이 없습니다.</p>
            </div>
          )}

          {!isLoading && !error && items.length > 0 && (
            <ul className="divide-y divide-zinc-800">
              {items.map((item) => (
                <li key={item.id} className="p-4 hover:bg-zinc-800/50 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-zinc-500 mb-1">{formatDate(item.createdAt)}</p>
                      <p className="text-sm text-zinc-200 leading-snug line-clamp-3">
                        {item.preview}
                      </p>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {item.relationship && (
                          <span className="inline-block px-1.5 py-0.5 rounded text-[10px] bg-zinc-700 text-zinc-400">
                            {item.relationship}
                          </span>
                        )}
                        {item.purpose && (
                          <span className="inline-block px-1.5 py-0.5 rounded text-[10px] bg-zinc-700 text-zinc-400">
                            {item.purpose}
                          </span>
                        )}
                        {item.tone && item.tone !== 'neutral' && (
                          <span className="inline-block px-1.5 py-0.5 rounded text-[10px] bg-zinc-700 text-zinc-400">
                            {item.tone}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => void handleLoad(item)}
                      disabled={loadingId === item.id}
                      className="shrink-0 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 
                        disabled:bg-zinc-700 disabled:cursor-not-allowed
                        text-xs font-medium transition-colors whitespace-nowrap"
                    >
                      {loadingId === item.id ? '로딩...' : '불러오기'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="px-5 py-3 border-t border-zinc-800">
          <a
            href="/main/archives"
            className="block text-center text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            전체 아카이브 보기 →
          </a>
        </div>
      </div>
    </>
  );
}
