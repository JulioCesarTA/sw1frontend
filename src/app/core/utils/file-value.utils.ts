
export interface StoredFileValue {
  fileName?: string;
  storedName: string;
  downloadPath?: string;
  workflowName?: string;
  tramiteFolder?: string;
}

export interface StoredFileDownloadContext {
  tramiteId?: string;
  fieldName?: string;
}

export function isStoredFileValue(value: unknown): value is StoredFileValue {
  return !!value && typeof value === 'object' && 'storedName' in (value as Record<string, unknown>);
}

export function isStoredFileArray(value: unknown): value is StoredFileValue[] {
  return Array.isArray(value) && value.every(item => isStoredFileValue(item));
}

export function storedFileLabel(value: unknown): string {
  if (!isStoredFileValue(value)) return '';
  return value.fileName || value.storedName || '';
}

export function openStoredFileDownload(value: unknown, context?: StoredFileDownloadContext): void {
  if (!isStoredFileValue(value) || !value.downloadPath) return;
  const a = document.createElement('a');
  a.href = value.downloadPath;
  a.download = storedFileLabel(value);
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
