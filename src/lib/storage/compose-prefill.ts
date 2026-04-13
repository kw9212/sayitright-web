/**
 * 아카이브 → 이메일 작성 페이지로 콘텐츠를 전달하기 위한 sessionStorage 유틸리티
 * 페이지 이동 직전에 set, 이메일 작성 페이지 마운트 시 get 후 즉시 clear
 */

const STORAGE_KEY = 'sayitright_compose_prefill';

export interface ComposePrefill {
  content: string;
  rationale?: string;
  tone?: string;
  relationship?: string;
  purpose?: string;
}

export function setComposePrefill(data: ComposePrefill): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function getAndClearComposePrefill(): ComposePrefill | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(STORAGE_KEY);
    return JSON.parse(raw) as ComposePrefill;
  } catch {
    sessionStorage.removeItem(STORAGE_KEY);
    return null;
  }
}
