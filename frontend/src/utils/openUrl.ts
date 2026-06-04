import { useConfigStore, type LinkOpenMode } from '../store/configStore';

export function openUrl(url: string, mode?: LinkOpenMode) {
  const linkOpenMode = mode ?? useConfigStore.getState().linkOpenMode;

  if (linkOpenMode === 'current') {
    window.location.href = url;
    return;
  }

  window.open(url, '_blank', 'noopener,noreferrer');
}
