'use client';

import { useAuth } from '@/lib/auth/auth-context';
import { MainHeader } from '@/components/layout/MainHeader';
import { GuestLimitModal } from '@/components/layout/GuestLimitModal';
import { useState, useEffect } from 'react';
import { generateEmail } from '@/lib/api/email-generation';
import { renderMarkdown } from '@/lib/utils/markdown';
import { tokenStore } from '@/lib/auth/token';
import { templatesRepository } from '@/lib/repositories/templates.repository';
import { guestTemplatesRepository } from '@/lib/repositories/guest-templates.repository';
import { guestArchivesRepository } from '@/lib/repositories/guest-archives.repository';
import {
  GUEST_LIMITS,
  canGenerateEmail,
  incrementEmailCount,
  incrementTemplateCount,
  canCreateArchive,
  incrementArchiveCount,
} from '@/lib/storage/guest-limits';
import { sendGAEvent } from '@next/third-parties/google';
import { toast } from 'sonner';
import SaveTemplateModal from './SaveTemplateModal';
import HistoryDrawer from './HistoryDrawer';
import FilterPresetBar from './FilterPresetBar';
import type { FilterPreset } from '@/lib/storage/filter-presets';
import { getAndClearComposePrefill } from '@/lib/storage/compose-prefill';

type EmailFilters = {
  relationship: string;
  purpose: string;
  tone: string;
  length: string;
  language: string;
};

export default function EmailComposePage() {
  const auth = useAuth();
  const [filters, setFilters] = useState<EmailFilters>({
    relationship: '',
    purpose: '',
    tone: '',
    length: '',
    language: 'ko',
  });
  const [isAdvancedMode, setIsAdvancedMode] = useState(false);
  const [customInputs, setCustomInputs] = useState({
    relationship: '',
    purpose: '',
    tone: '',
  });
  const [userInput, setUserInput] = useState('');
  const [generatedEmail, setGeneratedEmail] = useState('');
  const [generatedRationale, setGeneratedRationale] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [showAdvancedFilterModal, setShowAdvancedFilterModal] = useState(false);
  const [missingAdvancedFilters, setMissingAdvancedFilters] = useState<
    { name: string; defaultValue: string }[]
  >([]);
  const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [refinementInput, setRefinementInput] = useState('');
  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [editableEmail, setEditableEmail] = useState('');
  const [showGuestLimitModal, setShowGuestLimitModal] = useState(false);
  const [guestLimitType, setGuestLimitType] = useState<'template' | 'archive' | 'note' | 'email'>(
    'email',
  );
  const [showHistoryDrawer, setShowHistoryDrawer] = useState(false);

  const isGuest = auth.status === 'guest';

  useEffect(() => {
    const refreshTokenOnMount = async () => {
      if (auth.status === 'authenticated' && tokenStore.getAccessToken()) {
        try {
          const response = await fetch('/api/auth/refresh', { method: 'POST' });
          const data = await response.json();

          if (response.ok && data?.data?.accessToken) {
            tokenStore.setAccessToken(data.data.accessToken);
          }
        } catch (error) {
          console.error('토큰 갱신 실패:', error);
        }
      }
    };

    void refreshTokenOnMount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 아카이브 재생성: 페이지 진입 시 sessionStorage에 prefill 데이터가 있으면 결과란에 적용
  useEffect(() => {
    const prefill = getAndClearComposePrefill();
    if (!prefill) return;

    setGeneratedEmail(prefill.content);
    setEditableEmail(prefill.content);
    setIsEditingEmail(false);
    setGeneratedRationale(prefill.rationale ?? '');

    if (prefill.relationship) {
      setFilters((prev) => ({ ...prev, relationship: prefill.relationship! }));
    }
    if (prefill.purpose) {
      setFilters((prev) => ({ ...prev, purpose: prefill.purpose! }));
    }
    if (prefill.tone && prefill.tone !== 'neutral') {
      setFilters((prev) => ({ ...prev, tone: prefill.tone! }));
      setIsAdvancedMode(true);
    }
  }, []);

  const getInputLimit = (): number => {
    if (!isAdvancedMode) {
      const isPremium = auth.user?.tier === 'premium';

      if (isGuest) {
        return 150;
      }

      if (isPremium) {
        return 600;
      }

      return 300;
    }

    const limits: Record<string, number> = {
      short: 150,
      medium: 300,
      long: 600,
    };

    const lengthLimit = filters.length ? limits[filters.length] : limits.medium;
    return lengthLimit;
  };

  const inputLimit = getInputLimit();
  const currentLength = userInput.trim().length;
  const isOverLimit = currentLength > inputLimit;
  const limitPercentage = (currentLength / inputLimit) * 100;

  const handleFilterChange = (key: keyof EmailFilters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleLoadPreset = (preset: FilterPreset) => {
    setFilters({
      language: preset.language,
      relationship: preset.relationship,
      purpose: preset.purpose,
      tone: preset.tone ?? '',
      length: preset.length ?? '',
    });
    setCustomInputs({
      relationship: preset.customRelationship ?? '',
      purpose: preset.customPurpose ?? '',
      tone: preset.customTone ?? '',
    });
    if (preset.isAdvancedMode) {
      setIsAdvancedMode(true);
    }
  };

  if (auth.status === 'loading') {
    return <div className="min-h-screen bg-zinc-950 text-zinc-50">로딩중...</div>;
  }

  const checkRequiredFilters = (): boolean => {
    const hasRelationship =
      filters.relationship &&
      filters.relationship !== '' &&
      (filters.relationship !== 'custom' || customInputs.relationship.trim() !== '');

    if (!hasRelationship) {
      setToastMessage('📝 수신자와의 관계를 선택해주세요.');
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
      return false;
    }

    const hasPurpose =
      filters.purpose &&
      filters.purpose !== '' &&
      (filters.purpose !== 'custom' || customInputs.purpose.trim() !== '');

    if (!hasPurpose) {
      setToastMessage('📝 이메일의 목적을 선택해주세요.');
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
      return false;
    }

    return true;
  };

  const checkAdvancedFilters = (): boolean => {
    if (!isAdvancedMode) {
      return true;
    }

    const missing: { name: string; defaultValue: string }[] = [];

    const hasTone =
      filters.tone &&
      filters.tone !== '' &&
      (filters.tone !== 'custom' || customInputs.tone.trim() !== '');

    if (!hasTone) {
      missing.push({ name: '톤', defaultValue: '공손한' });
    }

    const hasLength = filters.length && filters.length !== '';

    if (!hasLength) {
      missing.push({ name: '길이', defaultValue: '보통' });
    }

    if (missing.length > 0) {
      setMissingAdvancedFilters(missing);
      setShowAdvancedFilterModal(true);
      return false;
    }

    return true;
  };

  const handleGenerate = async () => {
    if (!userInput.trim()) {
      setToastMessage('⚠️ 이메일 내용을 입력해주세요.');
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
      return;
    }

    // 게스트 모드: 일일 이메일 생성 한도 체크
    if (isGuest && !canGenerateEmail()) {
      setGuestLimitType('email');
      setShowGuestLimitModal(true);
      return;
    }

    if (!checkRequiredFilters()) {
      return;
    }

    if (!checkAdvancedFilters()) {
      return;
    }

    await executeGeneration();
  };

  const executeGeneration = async () => {
    setIsGenerating(true);
    try {
      const relationship =
        filters.relationship === 'custom' ? customInputs.relationship : filters.relationship;
      const purpose = filters.purpose === 'custom' ? customInputs.purpose : filters.purpose;
      let tone =
        isAdvancedMode && filters.tone === 'custom'
          ? customInputs.tone
          : isAdvancedMode
            ? filters.tone
            : undefined;
      let length = isAdvancedMode ? filters.length : undefined;

      if (isAdvancedMode && (!tone || tone.trim() === '')) {
        tone = 'polite';
      }
      if (isAdvancedMode && (!length || length.trim() === '')) {
        length = 'medium';
      }

      const finalFilters = {
        relationship: relationship && relationship.trim() !== '' ? relationship : undefined,
        purpose: purpose && purpose.trim() !== '' ? purpose : undefined,
        tone: tone && tone.trim() !== '' ? tone : undefined,
        length: length && length.trim() !== '' ? length : undefined,
      };

      const isRefinement = !!(generatedEmail && refinementInput.trim());

      const response = await generateEmail({
        draft: userInput.trim(),
        language: filters.language as 'ko' | 'en',
        relationship: finalFilters.relationship,
        purpose: finalFilters.purpose,
        tone: finalFilters.tone,
        length: finalFilters.length as 'short' | 'medium' | 'long' | undefined,
        includeRationale: isAdvancedMode && (!!finalFilters.tone || !!finalFilters.length),
        ...(isRefinement && {
          previousEmail: generatedEmail,
          refinementFeedback: refinementInput.trim(),
        }),
      });

      setGeneratedEmail(response.data.email);
      setEditableEmail(response.data.email);
      setIsEditingEmail(false);
      if (isRefinement) setRefinementInput('');

      sendGAEvent('event', isRefinement ? 'refine_email' : 'generate_email', {
        mode: isAdvancedMode ? 'advanced' : 'basic',
        user_type: isGuest ? 'guest' : 'user',
      });

      if (response.data.rationale) {
        setGeneratedRationale(response.data.rationale);
      } else {
        setGeneratedRationale('');
      }

      // 게스트 모드: 이메일 생성 카운트 증가 + 아카이브 자동 저장
      if (isGuest) {
        incrementEmailCount();

        // 아카이브 한도 체크 후 저장
        if (canCreateArchive()) {
          try {
            await guestArchivesRepository.create({
              title: '', // 아카이브는 제목 없음
              content: response.data.email,
              tone: finalFilters.tone || 'neutral',
              purpose: finalFilters.purpose,
              relationship: finalFilters.relationship,
              rationale: response.data.rationale,
            });
            incrementArchiveCount();
          } catch (archiveError) {
            console.error('아카이브 자동 저장 실패:', archiveError);
            // 아카이브 저장 실패는 조용히 처리 (이메일 생성은 성공했으므로)
          }
        }
      }
    } catch (error) {
      console.error('이메일 생성 실패:', error);

      const errorMessage = error instanceof Error ? error.message : '이메일 생성에 실패했습니다.';

      setToastMessage(`❌ ${errorMessage}`);
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(isEditingEmail ? editableEmail : generatedEmail);
      setToastMessage('✅ 클립보드에 복사되었습니다!');
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
    } catch (error) {
      console.error('복사 실패:', error);
      setToastMessage('❌ 복사에 실패했습니다.');
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
    }
  };

  const handleSaveTemplate = async () => {
    if (!generatedEmail) {
      toast.error('저장할 이메일이 없습니다. 먼저 이메일을 생성해주세요.');
      return;
    }

    // 게스트 모드 한도 체크: localStorage 카운터 대신 IndexedDB 실제 데이터 기준으로 확인
    if (isGuest) {
      const actualCount = await guestTemplatesRepository.count();
      if (actualCount >= GUEST_LIMITS.TEMPLATES) {
        setGuestLimitType('template');
        setShowGuestLimitModal(true);
        return;
      }
    }

    setShowSaveTemplateModal(true);
  };

  const handleConfirmSaveTemplate = async (title: string) => {
    setIsSavingTemplate(true);

    try {
      const finalRelationship = filters.relationship || customInputs.relationship;
      const finalPurpose = filters.purpose || customInputs.purpose;
      const finalTone = filters.tone || customInputs.tone || 'polite';

      const templateData = {
        title: title || undefined,
        content: isEditingEmail ? editableEmail : generatedEmail,
        tone: finalTone,
        relationship: finalRelationship || undefined,
        purpose: finalPurpose || undefined,
        rationale: generatedRationale || undefined,
      };

      // 게스트 모드: IndexedDB에 저장
      if (isGuest) {
        await guestTemplatesRepository.create(templateData);
        incrementTemplateCount();
        toast.success('✅ 템플릿이 저장되었습니다!');
        sendGAEvent('event', 'save_template', { user_type: 'guest' });
      }
      // 로그인 사용자: 백엔드 API에 저장
      else {
        const response = await templatesRepository.create(templateData);
        if (response.ok) {
          toast.success('✅ 템플릿이 저장되었습니다!');
          sendGAEvent('event', 'save_template', { user_type: 'user' });
        }
      }

      setShowSaveTemplateModal(false);
    } catch (error) {
      console.error('템플릿 저장 실패:', error);
      const errorMessage = error instanceof Error ? error.message : '템플릿 저장에 실패했습니다.';
      toast.error(errorMessage);
    } finally {
      setIsSavingTemplate(false);
    }
  };

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-50">
      <MainHeader title="이메일 작성" showBackButton={true} />

      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-[calc(100vh-120px)]">
          <div className="flex flex-col gap-6">
            <div className="rounded-lg bg-zinc-900 p-6 border border-zinc-800">
              <h2 className="text-lg font-semibold mb-4">필터 설정</h2>

              <FilterPresetBar
                currentFilters={{
                  language: filters.language as 'ko' | 'en',
                  relationship: filters.relationship,
                  purpose: filters.purpose,
                  tone: filters.tone,
                  length: filters.length,
                }}
                currentCustomInputs={customInputs}
                isAdvancedMode={isAdvancedMode}
                onLoad={handleLoadPreset}
              />

              <div className="mb-6 p-4 rounded-lg bg-zinc-800 border border-zinc-700">
                <label className="block text-sm font-medium text-zinc-300 mb-3">🌐 언어 선택</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleFilterChange('language', 'ko')}
                    className={`flex-1 py-2 px-4 rounded-lg font-medium 
                      transition-all ${
                        filters.language === 'ko'
                          ? 'bg-blue-600 text-white'
                          : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
                      }`}
                  >
                    한국어
                  </button>
                  <button
                    onClick={() => handleFilterChange('language', 'en')}
                    className={`flex-1 py-2 px-4 rounded-lg font-medium 
                      transition-all ${
                        filters.language === 'en'
                          ? 'bg-blue-600 text-white'
                          : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
                      }`}
                  >
                    English
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-2">
                    관계 <span className="text-xs text-green-400">(기본)</span>
                  </label>
                  <select
                    value={filters.relationship}
                    onChange={(e) => handleFilterChange('relationship', e.target.value)}
                    className="w-full px-4 py-2 rounded-lg bg-zinc-800 
                      border border-zinc-700 focus:border-blue-500 
                      focus:outline-none transition-colors"
                  >
                    <option value="">선택하세요</option>
                    <option value="professor">교수님</option>
                    <option value="supervisor">상사</option>
                    <option value="colleague">동료</option>
                    <option value="client">고객</option>
                    <option value="friend">친구</option>
                    <option value="custom">직접 입력</option>
                  </select>

                  {filters.relationship === 'custom' && (
                    <input
                      type="text"
                      value={customInputs.relationship}
                      onChange={(e) =>
                        setCustomInputs((prev) => ({
                          ...prev,
                          relationship: e.target.value,
                        }))
                      }
                      placeholder="예: 사촌, 선배님 등"
                      className="mt-2 w-full px-4 py-2 rounded-lg bg-zinc-800 
                        border border-zinc-700 focus:border-blue-500 
                        focus:outline-none transition-colors"
                    />
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-2">
                    목적 <span className="text-xs text-green-400">(기본)</span>
                  </label>
                  <select
                    value={filters.purpose}
                    onChange={(e) => handleFilterChange('purpose', e.target.value)}
                    className="w-full px-4 py-2 rounded-lg bg-zinc-800 
                      border border-zinc-700 focus:border-blue-500 
                      focus:outline-none transition-colors"
                  >
                    <option value="">선택하세요</option>
                    <option value="request">요청</option>
                    <option value="apology">사과</option>
                    <option value="thank">감사</option>
                    <option value="inquiry">문의</option>
                    <option value="report">보고</option>
                    <option value="custom">직접 입력</option>
                  </select>

                  {filters.purpose === 'custom' && (
                    <input
                      type="text"
                      value={customInputs.purpose}
                      onChange={(e) =>
                        setCustomInputs((prev) => ({
                          ...prev,
                          purpose: e.target.value,
                        }))
                      }
                      placeholder="예: 축하, 위로 등"
                      className="mt-2 w-full px-4 py-2 rounded-lg bg-zinc-800 
                        border border-zinc-700 focus:border-blue-500 
                        focus:outline-none transition-colors"
                    />
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-2">
                    톤 <span className="text-xs text-yellow-400">(고급)</span>
                  </label>
                  <select
                    value={filters.tone}
                    onChange={(e) => handleFilterChange('tone', e.target.value)}
                    disabled={!isAdvancedMode}
                    className="w-full px-4 py-2 rounded-lg bg-zinc-800 
                      border border-zinc-700 focus:border-blue-500 
                      focus:outline-none transition-colors 
                      disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <option value="">선택하세요</option>
                    <option value="formal">격식있는</option>
                    <option value="polite">공손한</option>
                    <option value="casual">캐주얼</option>
                    <option value="friendly">친근한</option>
                    <option value="custom">직접 입력</option>
                  </select>

                  {filters.tone === 'custom' && (
                    <input
                      type="text"
                      value={customInputs.tone}
                      onChange={(e) =>
                        setCustomInputs((prev) => ({
                          ...prev,
                          tone: e.target.value,
                        }))
                      }
                      placeholder="예: 유머러스한, 진지한 등"
                      disabled={!isAdvancedMode}
                      className="mt-2 w-full px-4 py-2 rounded-lg bg-zinc-800 
                        border border-zinc-700 focus:border-blue-500 
                        focus:outline-none transition-colors 
                        disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-2">
                    길이 <span className="text-xs text-yellow-400">(고급)</span>
                  </label>
                  <select
                    value={filters.length}
                    onChange={(e) => handleFilterChange('length', e.target.value)}
                    disabled={!isAdvancedMode}
                    className="w-full px-4 py-2 rounded-lg bg-zinc-800 
                      border border-zinc-700 focus:border-blue-500 
                      focus:outline-none transition-colors 
                      disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <option value="">선택하세요</option>
                    <option value="short">짧게 (간결)</option>
                    <option value="medium">보통</option>
                    <option value="long">길게 (상세)</option>
                  </select>
                </div>
              </div>
            </div>

            <div
              className="flex-1 flex flex-col rounded-lg 
              bg-zinc-900 p-6 border border-zinc-800"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">이메일 내용 작성</h2>

                <div className="flex items-center gap-2">
                  <div
                    className={`text-sm font-medium ${
                      isOverLimit
                        ? 'text-red-400'
                        : limitPercentage > 80
                          ? 'text-yellow-400'
                          : 'text-zinc-400'
                    }`}
                  >
                    {currentLength.toLocaleString()} /{inputLimit.toLocaleString()}
                  </div>
                  {isOverLimit && <span className="text-xs text-red-400">⚠️ 제한 초과</span>}
                </div>
              </div>

              <div className="mb-3 h-1 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    isOverLimit
                      ? 'bg-red-500'
                      : limitPercentage > 80
                        ? 'bg-yellow-500'
                        : 'bg-blue-500'
                  }`}
                  style={{ width: `${Math.min(limitPercentage, 100)}%` }}
                />
              </div>

              {isOverLimit && (
                <div
                  className="mb-3 p-3 rounded-lg bg-red-900/20 
                    border border-red-700/30"
                >
                  <p className="text-xs text-red-300">
                    ⚠️ 입력 제한을 초과했습니다.
                    {isAdvancedMode && filters.length && (
                      <span className="ml-1">길이 설정을 변경하면 더 많이 작성할 수 있습니다.</span>
                    )}
                  </p>
                </div>
              )}

              <textarea
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                placeholder="전달하고 싶은 내용을 자유롭게 작성하세요..."
                maxLength={inputLimit + 100}
                className={`flex-1 w-full px-4 py-3 rounded-lg bg-zinc-800 
                  border ${
                    isOverLimit
                      ? 'border-red-500 focus:border-red-400'
                      : 'border-zinc-700 focus:border-blue-500'
                  } focus:outline-none transition-colors 
                  resize-none min-h-[300px]`}
              />
            </div>

            <button
              onClick={handleGenerate}
              disabled={isGenerating || isOverLimit}
              className={`w-full py-4 rounded-lg font-semibold 
                transition-colors ${
                  isOverLimit
                    ? 'bg-zinc-700 cursor-not-allowed opacity-50'
                    : 'bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700'
                }`}
            >
              {isGenerating ? '생성 중...' : isOverLimit ? '⚠️ 입력 제한 초과' : '이메일 생성'}
            </button>

            {!isOverLimit && userInput && (
              <div className="text-xs text-zinc-500 text-center">
                💡 예상 출력: 약{' '}
                {filters.language === 'ko'
                  ? `${
                      filters.length === 'long'
                        ? '800-1000'
                        : filters.length === 'medium'
                          ? '400-500'
                          : '200-250'
                    }자`
                  : `${
                      filters.length === 'long'
                        ? '600-700'
                        : filters.length === 'medium'
                          ? '300-350'
                          : '150-180'
                    }단어`}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-6">
            <div
              className="flex items-center justify-between rounded-lg 
              bg-zinc-900 p-4 border border-zinc-800"
            >
              <div>
                <h3 className="font-semibold">고급 기능</h3>
                <p className="text-xs text-zinc-400 mt-1">
                  추가 필터 + 개선 피드백 제공 {!isGuest && '(크레딧 1)'}
                </p>
              </div>
              <button
                onClick={() => setIsAdvancedMode(!isAdvancedMode)}
                className={`px-6 py-2 rounded-lg font-medium 
                  transition-colors ${
                    isAdvancedMode
                      ? 'bg-yellow-600 hover:bg-yellow-700 text-white'
                      : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
                  }`}
              >
                {isAdvancedMode ? '활성화됨 ✓' : '활성화'}
              </button>
            </div>

            <div className="flex-1 rounded-lg bg-zinc-900 p-6 border border-zinc-800 flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">생성된 이메일</h2>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowHistoryDrawer(true)}
                    className="text-xs px-3 py-1 rounded-lg border border-zinc-700 
                      bg-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 
                      transition-colors"
                  >
                    🕐 기록
                  </button>
                  {generatedEmail && !isGenerating && (
                    <button
                      onClick={() => {
                        if (!isEditingEmail) setEditableEmail(generatedEmail);
                        setIsEditingEmail((prev) => !prev);
                      }}
                      className={`text-xs px-3 py-1 rounded-lg border transition-colors ${
                        isEditingEmail
                          ? 'bg-blue-600 border-blue-500 text-white hover:bg-blue-700'
                          : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500'
                      }`}
                    >
                      {isEditingEmail ? '👁️ 미리보기' : '✏️ 직접 편집'}
                    </button>
                  )}
                </div>
              </div>

              {!generatedEmail && !isGenerating && (
                <div className="flex-1 flex items-center justify-center text-zinc-500">
                  <div className="text-center">
                    <div className="text-4xl mb-4">✉️</div>
                    <p>왼쪽에서 내용을 작성하고</p>
                    <p>&apos;이메일 생성&apos; 버튼을 눌러주세요</p>
                  </div>
                </div>
              )}

              {isGenerating && (
                <div className="flex-1 flex items-center justify-center text-zinc-400">
                  <div className="text-center">
                    <div className="animate-spin text-4xl mb-4">⏳</div>
                    <p>이메일을 생성하고 있습니다...</p>
                  </div>
                </div>
              )}

              {generatedEmail && !isGenerating && (
                <>
                  <div className="flex-1 overflow-auto mb-4">
                    {isEditingEmail ? (
                      <textarea
                        value={editableEmail}
                        onChange={(e) => setEditableEmail(e.target.value)}
                        className="w-full h-full min-h-[200px] px-3 py-3 rounded-lg
                          bg-zinc-800 border border-blue-500/50 focus:border-blue-500
                          focus:outline-none transition-colors resize-none
                          text-sm text-zinc-100 leading-relaxed"
                        spellCheck={false}
                      />
                    ) : (
                      <div className="text-sm leading-relaxed">
                        {renderMarkdown(generatedEmail)}
                      </div>
                    )}
                  </div>

                  {generatedRationale && (
                    <div
                      className="mb-4 p-4 rounded-lg bg-yellow-900/20 
                      border border-yellow-700/30"
                    >
                      <div className="text-xs leading-relaxed text-yellow-200">
                        {renderMarkdown(generatedRationale)}
                      </div>
                    </div>
                  )}

                  <div className="mt-2 mb-3 rounded-lg bg-zinc-800/60 border border-zinc-700 p-3">
                    <p className="text-xs text-zinc-400 mb-2">✏️ 이 이메일을 수정하고 싶다면</p>
                    <textarea
                      value={refinementInput}
                      onChange={(e) => setRefinementInput(e.target.value)}
                      placeholder="예: 더 공손하게, 더 간결하게, 마지막 문장을 부드럽게..."
                      maxLength={200}
                      rows={2}
                      className="w-full px-3 py-2 rounded-lg bg-zinc-900 
                        border border-zinc-700 focus:border-blue-500 
                        focus:outline-none transition-colors resize-none 
                        text-sm text-zinc-100 placeholder:text-zinc-600"
                    />
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-xs text-zinc-600">{refinementInput.length}/200</span>
                      <button
                        onClick={async () => {
                          if (!refinementInput.trim()) return;
                          await executeGeneration();
                        }}
                        disabled={!refinementInput.trim() || isGenerating}
                        className="px-4 py-1.5 rounded-lg bg-amber-600 
                          hover:bg-amber-700 disabled:bg-zinc-700 
                          disabled:cursor-not-allowed text-sm font-semibold 
                          transition-colors"
                      >
                        {isGenerating ? '재작성 중...' : '🔄 재작성'}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <button
                      onClick={handleCopy}
                      className="w-full py-3 rounded-lg bg-green-600 
                        hover:bg-green-700 font-semibold transition-colors"
                    >
                      📋 복사하기
                    </button>

                    <button
                      onClick={handleSaveTemplate}
                      className="w-full py-3 rounded-lg bg-purple-600 
                        hover:bg-purple-700 font-semibold transition-colors"
                    >
                      💾 템플릿으로 저장
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {showToast && (
        <div
          className="fixed bottom-8 right-8 bg-zinc-800 
            border border-zinc-700 text-white px-6 py-3 
            rounded-lg shadow-lg animate-bounce max-w-sm"
        >
          {toastMessage}
        </div>
      )}

      {showAdvancedFilterModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-6 max-w-md mx-4">
            <h3 className="text-xl font-semibold mb-4">⚙️ 고급 필터 미설정 확인</h3>
            <p className="text-zinc-300 mb-4">다음 고급 필터가 설정되지 않았습니다:</p>
            <ul className="list-disc list-inside text-zinc-400 mb-4 space-y-1">
              {missingAdvancedFilters.map((item) => (
                <li key={item.name}>{item.name}</li>
              ))}
            </ul>
            <div className="bg-blue-900/20 border border-blue-700/30 rounded-lg p-4 mb-6">
              <p className="text-sm text-blue-200 mb-2">
                💡 <strong>빈 칸으로 제출하면 기본값이 적용됩니다:</strong>
              </p>
              <ul className="text-xs text-blue-300 ml-4 space-y-1">
                {missingAdvancedFilters.map((item) => (
                  <li key={item.name}>
                    • {item.name}: <strong>{item.defaultValue}</strong>
                  </li>
                ))}
              </ul>
            </div>
            <p className="text-sm text-zinc-400 mb-6">
              기본값으로 진행하시겠습니까?
              <br />
              <span className="text-xs text-zinc-500">(돌아가서 직접 설정할 수도 있습니다)</span>
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowAdvancedFilterModal(false)}
                className="flex-1 py-3 rounded-lg bg-zinc-700 
                  hover:bg-zinc-600 transition-colors"
              >
                돌아가기
              </button>
              <button
                onClick={async () => {
                  setShowAdvancedFilterModal(false);
                  await executeGeneration();
                }}
                className="flex-1 py-3 rounded-lg bg-blue-600 
                  hover:bg-blue-700 transition-colors font-semibold"
              >
                기본값으로 진행
              </button>
            </div>
          </div>
        </div>
      )}

      <SaveTemplateModal
        isOpen={showSaveTemplateModal}
        onClose={() => setShowSaveTemplateModal(false)}
        onConfirm={handleConfirmSaveTemplate}
        isLoading={isSavingTemplate}
      />

      <GuestLimitModal
        isOpen={showGuestLimitModal}
        onClose={() => setShowGuestLimitModal(false)}
        limitType={guestLimitType}
      />

      <HistoryDrawer
        isOpen={showHistoryDrawer}
        onClose={() => setShowHistoryDrawer(false)}
        isGuest={isGuest}
        onLoad={({ content, rationale }) => {
          setGeneratedEmail(content);
          setEditableEmail(content);
          setIsEditingEmail(false);
          setGeneratedRationale(rationale ?? '');
        }}
      />
    </main>
  );
}
