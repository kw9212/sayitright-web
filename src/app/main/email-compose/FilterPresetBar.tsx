'use client';

import { useState } from 'react';
import {
  getPresets,
  savePreset,
  deletePreset,
  MAX_PRESETS,
  type FilterPreset,
} from '@/lib/storage/filter-presets';

interface CurrentFilters {
  language: 'ko' | 'en';
  relationship: string;
  purpose: string;
  tone: string;
  length: string;
}

interface CurrentCustomInputs {
  relationship: string;
  purpose: string;
  tone: string;
}

interface FilterPresetBarProps {
  currentFilters: CurrentFilters;
  currentCustomInputs: CurrentCustomInputs;
  isAdvancedMode: boolean;
  onLoad: (preset: FilterPreset) => void;
}

function labelForValue(value: string, custom: string): string {
  if (!value) return '';
  if (value === 'custom') return custom || '직접입력';
  const map: Record<string, string> = {
    professor: '교수님',
    supervisor: '상사',
    colleague: '동료',
    client: '고객',
    friend: '친구',
    request: '요청',
    apology: '사과',
    thank: '감사',
    inquiry: '문의',
    report: '보고',
    formal: '격식있는',
    polite: '공손한',
    casual: '캐주얼',
    friendly: '친근한',
    short: '짧게',
    medium: '보통',
    long: '길게',
    ko: '한국어',
    en: 'English',
  };
  return map[value] ?? value;
}

export default function FilterPresetBar({
  currentFilters,
  currentCustomInputs,
  isAdvancedMode,
  onLoad,
}: FilterPresetBarProps) {
  const [presets, setPresets] = useState<FilterPreset[]>(() => getPresets());
  const [isSaving, setIsSaving] = useState(false);
  const [newName, setNewName] = useState('');
  const [nameError, setNameError] = useState('');

  const refreshPresets = () => setPresets(getPresets());

  const handleSave = () => {
    const trimmed = newName.trim();
    if (!trimmed) {
      setNameError('이름을 입력해주세요.');
      return;
    }
    if (trimmed.length > 20) {
      setNameError('최대 20자까지 입력할 수 있습니다.');
      return;
    }

    savePreset({
      name: trimmed,
      language: currentFilters.language,
      relationship: currentFilters.relationship,
      customRelationship:
        currentFilters.relationship === 'custom' ? currentCustomInputs.relationship : undefined,
      purpose: currentFilters.purpose,
      customPurpose: currentFilters.purpose === 'custom' ? currentCustomInputs.purpose : undefined,
      isAdvancedMode,
      tone: isAdvancedMode ? currentFilters.tone : undefined,
      customTone:
        isAdvancedMode && currentFilters.tone === 'custom' ? currentCustomInputs.tone : undefined,
      length: isAdvancedMode ? currentFilters.length : undefined,
    });

    refreshPresets();
    setNewName('');
    setIsSaving(false);
    setNameError('');
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deletePreset(id);
    refreshPresets();
  };

  const canSave =
    (currentFilters.relationship && currentFilters.relationship !== '') ||
    (currentFilters.purpose && currentFilters.purpose !== '');

  return (
    <div className="mb-5 rounded-lg bg-zinc-800/60 border border-zinc-700 p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-zinc-400">⭐ 프리셋</span>
        {!isSaving ? (
          <button
            onClick={() => {
              if (!canSave) return;
              setIsSaving(true);
              setNameError('');
            }}
            disabled={!canSave || presets.length >= MAX_PRESETS}
            title={
              presets.length >= MAX_PRESETS
                ? `최대 ${MAX_PRESETS}개까지 저장 가능합니다`
                : !canSave
                  ? '관계 또는 목적을 먼저 선택해주세요'
                  : '현재 필터 설정을 프리셋으로 저장'
            }
            className="text-xs px-2.5 py-1 rounded-md bg-zinc-700 hover:bg-zinc-600 
              text-zinc-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            + 현재 설정 저장
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <div className="flex-1 flex flex-col">
              <input
                autoFocus
                type="text"
                value={newName}
                onChange={(e) => {
                  setNewName(e.target.value);
                  setNameError('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSave();
                  if (e.key === 'Escape') {
                    setIsSaving(false);
                    setNewName('');
                    setNameError('');
                  }
                }}
                placeholder="프리셋 이름 (예: 교수님께 보고)"
                maxLength={20}
                className="text-xs px-2.5 py-1.5 rounded-md bg-zinc-900 border 
                  border-zinc-600 focus:border-blue-500 focus:outline-none 
                  text-zinc-100 w-44 placeholder:text-zinc-600"
              />
              {nameError && <span className="text-[10px] text-red-400 mt-0.5">{nameError}</span>}
            </div>
            <button
              onClick={handleSave}
              className="text-xs px-2.5 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 
                text-white font-medium transition-colors"
            >
              저장
            </button>
            <button
              onClick={() => {
                setIsSaving(false);
                setNewName('');
                setNameError('');
              }}
              className="text-xs px-2 py-1.5 rounded-md bg-zinc-700 hover:bg-zinc-600 
                text-zinc-400 transition-colors"
            >
              취소
            </button>
          </div>
        )}
      </div>

      {presets.length === 0 ? (
        <p className="text-[11px] text-zinc-600 py-1">
          자주 쓰는 필터 조합을 저장하면 여기에 표시됩니다.
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {presets.map((preset) => {
            const tags = [
              labelForValue(preset.relationship, preset.customRelationship ?? ''),
              labelForValue(preset.purpose, preset.customPurpose ?? ''),
              preset.isAdvancedMode && preset.tone
                ? labelForValue(preset.tone, preset.customTone ?? '')
                : '',
              preset.isAdvancedMode && preset.length ? labelForValue(preset.length, '') : '',
            ]
              .filter(Boolean)
              .join(' · ');

            return (
              <button
                key={preset.id}
                onClick={() => onLoad(preset)}
                title={tags}
                className="group inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full 
                  bg-zinc-700 hover:bg-zinc-600 border border-zinc-600 hover:border-zinc-500
                  text-xs text-zinc-300 transition-colors"
              >
                <span className="max-w-[90px] truncate">{preset.name}</span>
                <span
                  role="button"
                  onClick={(e) => handleDelete(preset.id, e)}
                  className="text-zinc-500 hover:text-red-400 transition-colors leading-none"
                  aria-label={`${preset.name} 프리셋 삭제`}
                >
                  ×
                </span>
              </button>
            );
          })}
          <span className="text-[10px] text-zinc-600 self-center">
            {presets.length}/{MAX_PRESETS}
          </span>
        </div>
      )}
    </div>
  );
}
