// T-486 (f) — the one upload ceiling and the words that go with it.
import { describe, expect, it } from 'vitest';
import {
  UPLOAD_MAX_BYTES,
  UPLOAD_MAX_LABEL,
  isOverUploadCeiling,
  uploadTooLargeDetail,
  uploadTooLargeLine,
} from './reference-intake';

describe('the upload ceiling (T-486 f)', () => {
  it('is 64 MB, and a file of exactly that is not over it', () => {
    expect(UPLOAD_MAX_BYTES).toBe(64 * 1024 * 1024);
    expect(UPLOAD_MAX_LABEL).toBe('64 MB');
    expect(isOverUploadCeiling(UPLOAD_MAX_BYTES)).toBe(false);
    expect(isOverUploadCeiling(UPLOAD_MAX_BYTES + 1)).toBe(true);
    expect(isOverUploadCeiling(0)).toBe(false);
  });

  it('is said in words that name the file (when one is known) and the ceiling', () => {
    expect(uploadTooLargeLine('Survey.pdf')).toBe('Survey.pdf: not uploaded — larger than 64 MB');
    expect(uploadTooLargeDetail('Survey.pdf')).toBe('“Survey.pdf” is larger than 64 MB, the most reference intake takes');
    expect(uploadTooLargeDetail()).toBe('The file is larger than 64 MB, the most reference intake takes');
  });
});
