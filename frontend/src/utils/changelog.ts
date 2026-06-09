import data from '../changelog.json';

export interface ChangelogEntry {
  version: string;
  /** ISO date, e.g. "2026-06-10" */
  date: string;
  /** Chinese change bullets */
  zh: string[];
  /** English change bullets */
  en: string[];
}

/**
 * Ordered newest-first. Single source of truth for both the in-app
 * "About / What's New" panel and the GitHub release notes (see
 * scripts/release-notes.mjs).
 */
export const changelog = data as ChangelogEntry[];

/** Current extension version. Reads the manifest in the extension runtime, falls back to the latest changelog entry. */
export function getAppVersion(): string {
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime?.getManifest) {
      return chrome.runtime.getManifest().version;
    }
  } catch {
    /* not running inside the extension */
  }
  return changelog[0]?.version ?? '';
}

/** Pick the change list matching the active UI language. */
export function changesForLanguage(entry: ChangelogEntry, language: string): string[] {
  return language === 'zh' ? entry.zh : entry.en;
}
