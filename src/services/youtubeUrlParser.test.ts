import { describe, expect, it } from 'vitest';
import { extractYouTubeVideoId } from './youtubeUrlParser';

describe('extractYouTubeVideoId', () => {
  const validId = 'dQw4w9WgXcQ';

  describe('raw 11-character video IDs', () => {
    it('accepts raw 11-character IDs directly', () => {
      expect(extractYouTubeVideoId(validId)).toBe(validId);
      expect(extractYouTubeVideoId('abcdefghijk')).toBe('abcdefghijk');
      expect(extractYouTubeVideoId('ABCDEFGHIJK')).toBe('ABCDEFGHIJK');
      expect(extractYouTubeVideoId('12345678901')).toBe('12345678901');
      expect(extractYouTubeVideoId('__--__--___')).toBe('__--__--___');
    });

    it('trims leading and trailing whitespace around raw IDs', () => {
      expect(extractYouTubeVideoId(`   ${validId}   `)).toBe(validId);
      expect(extractYouTubeVideoId(`\n\t${validId}\n`)).toBe(validId);
    });
  });

  describe('standard youtube.com URLs', () => {
    it('parses standard watch URLs with https', () => {
      expect(extractYouTubeVideoId(`https://www.youtube.com/watch?v=${validId}`)).toBe(validId);
      expect(extractYouTubeVideoId(`https://youtube.com/watch?v=${validId}`)).toBe(validId);
    });

    it('parses watch URLs with http', () => {
      expect(extractYouTubeVideoId(`http://www.youtube.com/watch?v=${validId}`)).toBe(validId);
    });

    it('parses watch URLs without protocol prefix', () => {
      expect(extractYouTubeVideoId(`www.youtube.com/watch?v=${validId}`)).toBe(validId);
      expect(extractYouTubeVideoId(`youtube.com/watch?v=${validId}`)).toBe(validId);
    });

    it('parses mobile m.youtube.com URLs', () => {
      expect(extractYouTubeVideoId(`https://m.youtube.com/watch?v=${validId}`)).toBe(validId);
    });

    it('parses music.youtube.com URLs', () => {
      expect(extractYouTubeVideoId(`https://music.youtube.com/watch?v=${validId}`)).toBe(validId);
    });

    it('handles additional query parameters (timestamps, playlists, tracking)', () => {
      expect(
        extractYouTubeVideoId(`https://www.youtube.com/watch?v=${validId}&t=30s&list=RDdQw4w9WgXcQ&index=1`)
      ).toBe(validId);
      expect(
        extractYouTubeVideoId(`https://www.youtube.com/watch?feature=share&v=${validId}&ab_channel=Artist`)
      ).toBe(validId);
    });
  });

  describe('shortened youtu.be URLs', () => {
    it('parses standard youtu.be links', () => {
      expect(extractYouTubeVideoId(`https://youtu.be/${validId}`)).toBe(validId);
      expect(extractYouTubeVideoId(`http://youtu.be/${validId}`)).toBe(validId);
      expect(extractYouTubeVideoId(`youtu.be/${validId}`)).toBe(validId);
    });

    it('handles query parameters on youtu.be links', () => {
      expect(extractYouTubeVideoId(`https://youtu.be/${validId}?t=120`)).toBe(validId);
      expect(extractYouTubeVideoId(`https://youtu.be/${validId}?si=xyz123`)).toBe(validId);
    });
  });

  describe('embed & shorts URLs', () => {
    it('parses embed URLs', () => {
      expect(extractYouTubeVideoId(`https://www.youtube.com/embed/${validId}`)).toBe(validId);
      expect(extractYouTubeVideoId(`https://www.youtube.com/embed/${validId}?autoplay=1&controls=0`)).toBe(validId);
    });

    it('parses shorts URLs', () => {
      expect(extractYouTubeVideoId(`https://www.youtube.com/shorts/${validId}`)).toBe(validId);
      expect(extractYouTubeVideoId(`https://youtube.com/shorts/${validId}?feature=share`)).toBe(validId);
    });
  });

  describe('invalid or unsupported inputs', () => {
    it('returns null for empty or whitespace-only strings', () => {
      expect(extractYouTubeVideoId('')).toBeNull();
      expect(extractYouTubeVideoId('   ')).toBeNull();
      expect(extractYouTubeVideoId('\t\n')).toBeNull();
    });

    it('returns null for non-YouTube domains even if containing 11-char parameter', () => {
      expect(extractYouTubeVideoId(`https://vimeo.com/${validId}`)).toBeNull();
      expect(extractYouTubeVideoId(`https://notyoutube.com/watch?v=${validId}`)).toBeNull();
      expect(extractYouTubeVideoId(`https://fakeyoutube.com/${validId}`)).toBeNull();
    });

    it('returns null for malformed IDs (not exactly 11 valid characters)', () => {
      expect(extractYouTubeVideoId('shortId')).toBeNull(); // 7 chars
      expect(extractYouTubeVideoId('123456789012')).toBeNull(); // 12 chars
      expect(extractYouTubeVideoId('dQw4w9WgXc!')).toBeNull(); // invalid character
      expect(extractYouTubeVideoId(`https://www.youtube.com/watch?v=short`)).toBeNull();
      expect(extractYouTubeVideoId(`https://youtu.be/tooLong12345`)).toBeNull();
    });

    it('returns null for non-string inputs safely', () => {
      // @ts-expect-error test runtime boundary safety
      expect(extractYouTubeVideoId(null)).toBeNull();
      // @ts-expect-error test runtime boundary safety
      expect(extractYouTubeVideoId(undefined)).toBeNull();
      // @ts-expect-error test runtime boundary safety
      expect(extractYouTubeVideoId(12345)).toBeNull();
    });
  });
});
