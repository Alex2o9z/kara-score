import type { NoteEvent, SongData } from '../types/karaoke';
import { extractYouTubeVideoId } from './youtubeUrlParser';

export interface SongCatalogEntry {
  songId: string;
  title: string;
  artist: string;
  youtubeVideoId: string;
  file: string;
}

export interface LaunchParams {
  videoId: string | null;
  title: string | null;
}

/**
 * Parses URL query parameters (e.g. ?v=dQw4w9WgXcQ&title=My%20Song or from window.location.search).
 * Validates the videoId using extractYouTubeVideoId and decodes the title parameter.
 */
export function parseLaunchParams(search: string): LaunchParams {
  if (!search || typeof search !== 'string') {
    return { videoId: null, title: null };
  }

  const cleanSearch = search.startsWith('?') ? search.slice(1) : search;
  if (!cleanSearch.trim()) {
    return { videoId: null, title: null };
  }

  const params = new URLSearchParams(cleanSearch);
  const rawV = params.get('v');
  const rawTitle = params.get('title');

  let videoId: string | null = null;
  if (rawV) {
    videoId = extractYouTubeVideoId(rawV);
  }

  let title: string | null = null;
  if (rawTitle && rawTitle.trim()) {
    try {
      title = decodeURIComponent(rawTitle.trim());
    } catch {
      title = rawTitle.trim();
    }
  }

  return { videoId, title };
}

/**
 * Helper to look up an entry in the catalog matching the YouTube Video ID.
 */
export function findSongInCatalog(
  catalog: SongCatalogEntry[],
  videoId: string
): SongCatalogEntry | undefined {
  if (!catalog || !Array.isArray(catalog) || !videoId) {
    return undefined;
  }
  return catalog.find((entry) => entry.youtubeVideoId === videoId);
}

/**
 * Validates and parses raw JSON text into a typed SongData chart.
 * Rejects malformed JSON, missing fields, or invalid note ranges.
 */
export function parseCustomSongJson(rawJson: string): SongData {
  if (!rawJson || typeof rawJson !== 'string') {
    throw new Error('Dữ liệu JSON rỗng hoặc không hợp lệ.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch (err) {
    throw new Error(`Cú pháp JSON không hợp lệ: ${(err as Error).message}`, {
      cause: err,
    });
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('File JSON phải chứa một đối tượng bài hát.');
  }

  const data = parsed as Record<string, unknown>;

  // Validate songId
  if (typeof data.songId !== 'string' || !data.songId.trim()) {
    throw new Error('Thiếu trường "songId" hoặc giá trị không hợp lệ.');
  }
  const songId = data.songId.trim();

  // Validate title
  if (typeof data.title !== 'string' || !data.title.trim()) {
    throw new Error('Thiếu trường "title" hoặc giá trị không hợp lệ.');
  }
  const title = data.title.trim();

  // Validate artist (default fallback if empty)
  const artist =
    typeof data.artist === 'string' && data.artist.trim()
      ? data.artist.trim()
      : 'Unknown Artist';

  // Validate youtubeVideoId
  if (typeof data.youtubeVideoId !== 'string') {
    throw new Error('Thiếu trường "youtubeVideoId".');
  }
  const validVideoId = extractYouTubeVideoId(data.youtubeVideoId);
  if (!validVideoId) {
    throw new Error(
      `"youtubeVideoId" không hợp lệ: phải là 11 ký tự YouTube Video ID (${data.youtubeVideoId}).`
    );
  }

  // Validate offsetMs
  let offsetMs = 0;
  if (data.offsetMs !== undefined && data.offsetMs !== null) {
    if (typeof data.offsetMs !== 'number' || !Number.isFinite(data.offsetMs)) {
      throw new Error('"offsetMs" phải là một số thực hợp lệ (mili-giây).');
    }
    offsetMs = data.offsetMs;
  }

  // Validate notes
  if (!Array.isArray(data.notes) || data.notes.length === 0) {
    throw new Error('Trường "notes" phải là một mảng nốt nhạc không rỗng.');
  }

  const validatedNotes: NoteEvent[] = [];
  for (let i = 0; i < data.notes.length; i++) {
    const rawNote = data.notes[i];
    if (typeof rawNote !== 'object' || rawNote === null) {
      throw new Error(`Nốt thứ ${i + 1} không phải là đối tượng hợp lệ.`);
    }

    const noteObj = rawNote as Record<string, unknown>;
    const { startMs, endMs, midiNote } = noteObj;

    if (typeof startMs !== 'number' || !Number.isFinite(startMs) || startMs < 0) {
      throw new Error(`Nốt thứ ${i + 1}: "startMs" phải là số >= 0.`);
    }

    if (typeof endMs !== 'number' || !Number.isFinite(endMs) || endMs <= startMs) {
      throw new Error(`Nốt thứ ${i + 1}: "endMs" (${endMs}) phải lớn hơn "startMs" (${startMs}).`);
    }

    if (
      typeof midiNote !== 'number' ||
      !Number.isInteger(midiNote) ||
      midiNote < 21 ||
      midiNote > 108
    ) {
      throw new Error(
        `Nốt thứ ${i + 1}: "midiNote" (${midiNote}) phải là số nguyên trong khoảng 21 (A0) đến 108 (C8).`
      );
    }

    validatedNotes.push({
      startMs,
      endMs,
      midiNote,
    });
  }

  // Sort notes chronologically
  validatedNotes.sort((a, b) => a.startMs - b.startMs);

  return {
    songId,
    title,
    artist,
    youtubeVideoId: validVideoId,
    offsetMs,
    notes: validatedNotes,
  };
}

/**
 * Fetches the song catalog index from public/songs/index.json.
 */
export async function fetchSongCatalog(
  catalogUrl = '/songs/index.json'
): Promise<SongCatalogEntry[]> {
  const res = await fetch(catalogUrl);
  if (!res.ok) {
    throw new Error(`Không tải được danh mục bài hát (${res.status} ${res.statusText}).`);
  }

  const data: unknown = await res.json();
  if (!Array.isArray(data)) {
    throw new Error('Danh mục bài hát index.json phải là một mảng.');
  }

  const catalog: SongCatalogEntry[] = [];
  for (let i = 0; i < data.length; i++) {
    const item = data[i];
    if (typeof item !== 'object' || item === null) continue;

    const entry = item as Record<string, unknown>;
    if (
      typeof entry.songId === 'string' &&
      typeof entry.title === 'string' &&
      typeof entry.artist === 'string' &&
      typeof entry.youtubeVideoId === 'string' &&
      typeof entry.file === 'string'
    ) {
      catalog.push({
        songId: entry.songId,
        title: entry.title,
        artist: entry.artist,
        youtubeVideoId: entry.youtubeVideoId,
        file: entry.file,
      });
    }
  }

  return catalog;
}

/**
 * Loads and validates an individual song chart file referenced by a catalog entry.
 */
export async function loadSongChart(
  entry: SongCatalogEntry,
  baseDir = '/songs/'
): Promise<SongData> {
  const normalizedBase = baseDir.endsWith('/') ? baseDir : `${baseDir}/`;
  const url = entry.file.startsWith('/') || entry.file.startsWith('http')
    ? entry.file
    : `${normalizedBase}${entry.file}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Không tải được phổ nốt bài hát (${res.status} ${res.statusText}).`);
  }

  const rawJson = await res.text();
  return parseCustomSongJson(rawJson);
}
