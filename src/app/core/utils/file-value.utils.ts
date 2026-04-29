import { environment } from '../../../environments/environment';

export interface StoredFileValue {
  fileName?: string;
  storedName: string;
  downloadPath?: string;
}

export function isStoredFileValue(value: unknown): value is StoredFileValue {
  return !!value && typeof value === 'object' && 'storedName' in (value as Record<string, unknown>);
}

export function storedFileLabel(value: unknown): string {
  if (!isStoredFileValue(value)) return '';
  return value.fileName || value.storedName || '';
}

export function openStoredFileDownload(value: unknown): void {
  if (!isStoredFileValue(value)) return;
  const path = value.downloadPath || `/files/${value.storedName}/download`;
  const separator = path.includes('?') ? '&' : '?';
  const url = `${environment.apiUrl}${path}${separator}filename=${encodeURIComponent(storedFileLabel(value))}`;
  const a = document.createElement('a');
  a.href = url;
  a.download = storedFileLabel(value);
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
