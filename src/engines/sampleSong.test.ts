import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SongData } from '../types/karaoke';

describe('sample-song.json chart validation', () => {
  const filePath = path.resolve(__dirname, '../../public/songs/sample-song.json');
  const fileContent = fs.readFileSync(filePath, 'utf8');
  const song: SongData = JSON.parse(fileContent);

  it('has valid metadata fields conforming strictly to SongData', () => {
    expect(song.songId).toBe('sample-song');
    expect(song.songId).toMatch(/^[a-z0-9_-]+$/);
    expect(song.title).toBe('KaraScore Test Melody');
    expect(song.artist).toBe('KaraScore Ensemble');
    expect(song.youtubeVideoId).toHaveLength(11);
    expect(typeof song.offsetMs).toBe('number');
    expect(Number.isFinite(song.offsetMs)).toBe(true);
  });

  it('contains non-empty notes array with chronological order and valid vocal ranges', () => {
    expect(Array.isArray(song.notes)).toBe(true);
    expect(song.notes.length).toBeGreaterThan(0);

    for (let i = 0; i < song.notes.length; i++) {
      const note = song.notes[i];
      // Timestamp integrity
      expect(note.startMs).toBeGreaterThanOrEqual(0);
      expect(note.endMs).toBeGreaterThan(note.startMs);

      // Vocal pitch range (C2 = 36 to C7 = 96)
      expect(Number.isInteger(note.midiNote)).toBe(true);
      expect(note.midiNote).toBeGreaterThanOrEqual(36);
      expect(note.midiNote).toBeLessThanOrEqual(96);

      // Chronological ordering without overlapping negative gaps
      if (i > 0) {
        const prevNote = song.notes[i - 1];
        expect(note.startMs).toBeGreaterThanOrEqual(prevNote.endMs);
      }
    }
  });

  it('includes clear rest gaps (>= 1000ms) between phrases for rest-period testing', () => {
    let restGapsFound = 0;
    for (let i = 1; i < song.notes.length; i++) {
      const gapMs = song.notes[i].startMs - song.notes[i - 1].endMs;
      if (gapMs >= 1000) {
        restGapsFound++;
      }
    }

    expect(restGapsFound).toBeGreaterThanOrEqual(2);
  });

  it('spans approximately 25 seconds for reliable benchmark tests', () => {
    const lastNote = song.notes[song.notes.length - 1];
    expect(lastNote.endMs).toBe(25000);
  });
});
