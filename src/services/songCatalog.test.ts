import { describe, expect, it } from 'vitest';
import {
  findSongInCatalog,
  parseCustomSongJson,
  parseLaunchParams,
  type SongCatalogEntry,
} from './songCatalog';

describe('songCatalog service', () => {
  describe('parseLaunchParams', () => {
    it('parses valid ?v=&title= query parameters correctly', () => {
      const res = parseLaunchParams('?v=dQw4w9WgXcQ&title=Sample%20Song');
      expect(res.videoId).toBe('dQw4w9WgXcQ');
      expect(res.title).toBe('Sample Song');
    });

    it('works without leading question mark', () => {
      const res = parseLaunchParams('v=jNQXAC9IVRw&title=Acoustic%20Ballad');
      expect(res.videoId).toBe('jNQXAC9IVRw');
      expect(res.title).toBe('Acoustic Ballad');
    });

    it('extracts video ID even if full YouTube URL is supplied in v param', () => {
      const res = parseLaunchParams(
        '?v=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DdQw4w9WgXcQ&title=Rolling'
      );
      expect(res.videoId).toBe('dQw4w9WgXcQ');
      expect(res.title).toBe('Rolling');
    });

    it('returns videoId: null if video ID is invalid', () => {
      const res = parseLaunchParams('?v=short&title=Test');
      expect(res.videoId).toBeNull();
      expect(res.title).toBe('Test');
    });

    it('returns videoId: null if v parameter is absent', () => {
      const res = parseLaunchParams('?title=Only%20Title');
      expect(res.videoId).toBeNull();
      expect(res.title).toBe('Only Title');
    });

    it('returns title: null if title parameter is absent or empty', () => {
      const res = parseLaunchParams('?v=dQw4w9WgXcQ');
      expect(res.videoId).toBe('dQw4w9WgXcQ');
      expect(res.title).toBeNull();
    });

    it('returns nulls for empty or non-string inputs', () => {
      expect(parseLaunchParams('')).toEqual({ videoId: null, title: null });
      expect(parseLaunchParams('?')).toEqual({ videoId: null, title: null });
      // @ts-expect-error testing runtime safety
      expect(parseLaunchParams(null)).toEqual({ videoId: null, title: null });
    });
  });

  describe('findSongInCatalog', () => {
    const mockCatalog: SongCatalogEntry[] = [
      {
        songId: 'song-1',
        title: 'Song One',
        artist: 'Artist One',
        youtubeVideoId: 'dQw4w9WgXcQ',
        file: 'sample-song.json',
      },
      {
        songId: 'song-2',
        title: 'Song Two',
        artist: 'Artist Two',
        youtubeVideoId: 'jNQXAC9IVRw',
        file: 'demo-ballad.json',
      },
    ];

    it('returns matching catalog entry when youtubeVideoId matches', () => {
      const match = findSongInCatalog(mockCatalog, 'dQw4w9WgXcQ');
      expect(match).toBeDefined();
      expect(match?.songId).toBe('song-1');
      expect(match?.title).toBe('Song One');
    });

    it('returns undefined when youtubeVideoId does not exist in catalog', () => {
      const match = findSongInCatalog(mockCatalog, '00000000000');
      expect(match).toBeUndefined();
    });

    it('handles empty or invalid catalog gracefully', () => {
      expect(findSongInCatalog([], 'dQw4w9WgXcQ')).toBeUndefined();
      // @ts-expect-error testing runtime safety
      expect(findSongInCatalog(null, 'dQw4w9WgXcQ')).toBeUndefined();
    });
  });

  describe('parseCustomSongJson', () => {
    const validJson = JSON.stringify({
      songId: 'my-song',
      title: 'My Custom Song',
      artist: 'Singer',
      youtubeVideoId: 'dQw4w9WgXcQ',
      offsetMs: 150,
      notes: [
        { startMs: 2000, endMs: 3000, midiNote: 64 },
        { startMs: 1000, endMs: 1800, midiNote: 60 },
      ],
    });

    it('parses valid custom JSON chart and sorts notes chronologically', () => {
      const parsed = parseCustomSongJson(validJson);
      expect(parsed.songId).toBe('my-song');
      expect(parsed.title).toBe('My Custom Song');
      expect(parsed.artist).toBe('Singer');
      expect(parsed.youtubeVideoId).toBe('dQw4w9WgXcQ');
      expect(parsed.offsetMs).toBe(150);
      expect(parsed.notes).toHaveLength(2);
      // Chronological sort verified: note at 1000ms comes first
      expect(parsed.notes[0].startMs).toBe(1000);
      expect(parsed.notes[1].startMs).toBe(2000);
    });

    it('provides fallback for missing artist and offsetMs', () => {
      const minimalJson = JSON.stringify({
        songId: 'minimal',
        title: 'Minimal Song',
        youtubeVideoId: 'jNQXAC9IVRw',
        notes: [{ startMs: 500, endMs: 1500, midiNote: 62 }],
      });

      const parsed = parseCustomSongJson(minimalJson);
      expect(parsed.artist).toBe('Unknown Artist');
      expect(parsed.offsetMs).toBe(0);
    });

    it('throws on invalid JSON syntax', () => {
      expect(() => parseCustomSongJson('{ not-valid-json }')).toThrowError(
        /Cú pháp JSON không hợp lệ/
      );
    });

    it('throws when root is not an object', () => {
      expect(() => parseCustomSongJson('[1, 2, 3]')).toThrowError(
        /File JSON phải chứa một đối tượng bài hát/
      );
    });

    it('throws when missing songId or title', () => {
      const missingTitle = JSON.stringify({
        songId: 'valid-id',
        youtubeVideoId: 'dQw4w9WgXcQ',
        notes: [{ startMs: 100, endMs: 500, midiNote: 60 }],
      });
      expect(() => parseCustomSongJson(missingTitle)).toThrowError(
        /Thiếu trường "title"/
      );
    });

    it('throws when youtubeVideoId is missing or invalid', () => {
      const invalidYt = JSON.stringify({
        songId: 'valid-id',
        title: 'Valid Title',
        youtubeVideoId: 'not-valid-id',
        notes: [{ startMs: 100, endMs: 500, midiNote: 60 }],
      });
      expect(() => parseCustomSongJson(invalidYt)).toThrowError(
        /"youtubeVideoId" không hợp lệ/
      );
    });

    it('throws when notes is empty or not an array', () => {
      const emptyNotes = JSON.stringify({
        songId: 'valid-id',
        title: 'Valid Title',
        youtubeVideoId: 'dQw4w9WgXcQ',
        notes: [],
      });
      expect(() => parseCustomSongJson(emptyNotes)).toThrowError(
        /Trường "notes" phải là một mảng nốt nhạc không rỗng/
      );
    });

    it('throws when note timing is invalid (endMs <= startMs)', () => {
      const badTiming = JSON.stringify({
        songId: 'valid-id',
        title: 'Valid Title',
        youtubeVideoId: 'dQw4w9WgXcQ',
        notes: [{ startMs: 1000, endMs: 900, midiNote: 60 }],
      });
      expect(() => parseCustomSongJson(badTiming)).toThrowError(
        /phải lớn hơn "startMs"/
      );
    });

    it('throws when midiNote is outside 21-108 or not an integer', () => {
      const badMidi = JSON.stringify({
        songId: 'valid-id',
        title: 'Valid Title',
        youtubeVideoId: 'dQw4w9WgXcQ',
        notes: [{ startMs: 1000, endMs: 2000, midiNote: 120 }],
      });
      expect(() => parseCustomSongJson(badMidi)).toThrowError(
        /"midiNote" \(120\) phải là số nguyên trong khoảng 21/
      );
    });
  });
});
