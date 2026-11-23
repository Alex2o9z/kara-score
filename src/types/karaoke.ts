export type PlayerState = 'UNSTARTED' | 'PLAYING' | 'PAUSED' | 'BUFFERING' | 'ENDED';

export type ScoringMode = 'exact' | 'smart';

export interface NoteEvent {
  startMs: number;
  endMs: number;
  midiNote: number;
}

export interface SongData {
  songId: string;
  title: string;
  artist: string;
  youtubeVideoId: string;
  offsetMs: number;
  notes: NoteEvent[];
}

export interface RawPitchFrame {
  hz: number | null;
  clarity: number;
  rms: number;
}

export interface SmoothedPitchFrame {
  hz: number | null;
  midi: number | null;
  noteName: string | null;
  clarity: number;
  rms: number;
  isValid: boolean;
}

export interface SmartVocalBreakdown {
  inTuneAccuracy: number;
  stabilityClarity: number;
  activeVocalCoverage: number;
  melodicVariety: number;
}

export type ScoreRating = 'S' | 'A' | 'B' | 'C';

export interface ScoreSnapshot {
  mode: ScoringMode;
  score: number;
  accuracyPct: number;
  combo: number;
  maxCombo: number;
  targetMidi: number | null;
  centsDelta: number | null;
  activeTicks: number;
  validVocalTicks: number;
  breakdown: SmartVocalBreakdown;
  rating: ScoreRating;
}
