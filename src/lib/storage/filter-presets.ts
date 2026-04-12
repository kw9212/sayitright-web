/**
 * 필터 프리셋 — localStorage 기반 저장/불러오기
 * 로그인 여부와 관계없이 브라우저에 최대 MAX_PRESETS개까지 저장됨
 */

const STORAGE_KEY = 'sayitright_filter_presets';
export const MAX_PRESETS = 5;

export interface FilterPreset {
  id: string;
  name: string;
  /** 언어 */
  language: 'ko' | 'en';
  /** 기본 필터 */
  relationship: string;
  customRelationship?: string;
  purpose: string;
  customPurpose?: string;
  /** 고급 필터 (고급 기능 활성화 시에만 저장) */
  isAdvancedMode: boolean;
  tone?: string;
  customTone?: string;
  length?: string;
  createdAt: string;
}

export function getPresets(): FilterPreset[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as FilterPreset[]) : [];
  } catch {
    return [];
  }
}

export function savePreset(preset: Omit<FilterPreset, 'id' | 'createdAt'>): FilterPreset {
  const presets = getPresets();

  if (presets.length >= MAX_PRESETS) {
    // 가장 오래된 프리셋 제거
    presets.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    presets.shift();
  }

  const newPreset: FilterPreset = {
    ...preset,
    id: `preset-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
  };

  presets.push(newPreset);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
  return newPreset;
}

export function deletePreset(id: string): void {
  const presets = getPresets().filter((p) => p.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
}

export function updatePresetName(id: string, name: string): void {
  const presets = getPresets().map((p) => (p.id === id ? { ...p, name } : p));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
}
