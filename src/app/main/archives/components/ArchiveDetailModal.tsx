'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { archivesRepository, type ArchiveDetail } from '@/lib/repositories/archives.repository';
import { guestArchivesRepository } from '@/lib/repositories/guest-archives.repository';
import { useAuth } from '@/lib/auth/auth-context';
import { getToneLabel, getRelationshipLabel, getPurposeLabel } from '@/lib/constants/filter-labels';
import { setComposePrefill } from '@/lib/storage/compose-prefill';
import { toast } from 'sonner';

type Props = {
  archiveId: string | null;
  onClose: () => void;
};

/**
 * Archive 상세보기 모달
 *
 * - archiveId로 전체 content 조회
 * - 스크롤 가능
 * - 복사 버튼
 */
export default function ArchiveDetailModal({ archiveId, onClose }: Props) {
  const auth = useAuth();
  const isGuest = auth.status === 'guest';
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [archive, setArchive] = useState<ArchiveDetail | null>(null);

  useEffect(() => {
    if (!archiveId) {
      setArchive(null);
      return;
    }

    const fetchArchiveDetail = async () => {
      setLoading(true);
      try {
        const repository = isGuest ? guestArchivesRepository : archivesRepository;
        const response = await repository.get(archiveId);
        if (response.ok && response.data) {
          setArchive(response.data);
        }
      } catch (error) {
        console.error('Archive 상세 조회 실패:', error);
        const errorMessage =
          error instanceof Error ? error.message : '아카이브 조회에 실패했습니다.';
        toast.error(errorMessage);
        onClose();
      } finally {
        setLoading(false);
      }
    };

    void fetchArchiveDetail();
  }, [archiveId, onClose, isGuest]);

  const handleCopy = () => {
    if (archive?.content) {
      void navigator.clipboard.writeText(archive.content);
      toast.success('클립보드에 복사되었습니다.');
    }
  };

  const handleRegenerate = () => {
    if (!archive) return;
    setComposePrefill({
      content: archive.content,
      rationale: archive.rationale,
      tone: archive.tone,
      relationship: archive.relationship,
      purpose: archive.purpose,
    });
    router.push('/main/email-compose');
  };

  const formattedDate = archive?.createdAt
    ? new Date(archive.createdAt).toLocaleString('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  return (
    <Dialog open={!!archiveId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[80vh] bg-zinc-900 text-white border-zinc-700">
        <DialogHeader>
          <DialogTitle className="text-xl">{archive?.title || formattedDate}</DialogTitle>
          <DialogDescription className="text-zinc-400">{formattedDate}</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-zinc-400">로딩 중...</div>
          </div>
        ) : archive ? (
          <div className="space-y-4">
            {/* Tags */}
            <div className="flex flex-wrap gap-2">
              <span className="px-3 py-1 text-xs rounded-full bg-blue-900/30 text-blue-300 border border-blue-700/30">
                {getToneLabel(archive.tone)}
              </span>
              {archive.relationship && (
                <span className="px-3 py-1 text-xs rounded-full bg-green-900/30 text-green-300 border border-green-700/30">
                  {getRelationshipLabel(archive.relationship)}
                </span>
              )}
              {archive.purpose && (
                <span className="px-3 py-1 text-xs rounded-full bg-purple-900/30 text-purple-300 border border-purple-700/30">
                  {getPurposeLabel(archive.purpose)}
                </span>
              )}
            </div>

            {/* Content - 스크롤 가능 */}
            <div className="max-h-[50vh] overflow-y-auto bg-zinc-800 rounded-lg p-4 border border-zinc-700">
              <p className="text-sm text-zinc-200 whitespace-pre-wrap leading-relaxed">
                {archive.content}
              </p>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap justify-end gap-3">
              <button
                onClick={handleRegenerate}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors text-sm font-medium"
              >
                🔄 이 이메일 기반으로 재생성
              </button>
              <button
                onClick={handleCopy}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
              >
                복사하기
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg transition-colors"
              >
                닫기
              </button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
