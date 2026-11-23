const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

export function hzToMidi(hz: number): number {
  if (hz <= 0 || !Number.isFinite(hz)) {
    return 0;
  }
  return 69 + 12 * Math.log2(hz / 440);
}

export function midiToHz(midi: number): number {
  if (!Number.isFinite(midi)) {
    return 0;
  }
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function midiToNoteName(midi: number): string {
  if (!Number.isFinite(midi)) {
    return '';
  }
  const roundedMidi = Math.round(midi);
  const noteIndex = ((roundedMidi % 12) + 12) % 12;
  const octave = Math.floor(roundedMidi / 12) - 1;
  return `${NOTE_NAMES[noteIndex]}${octave}`;
}

export function getCentsDiff(actualMidi: number, targetMidi: number): number {
  return (actualMidi - targetMidi) * 100;
}

export function getNearestSemitoneCentsDiff(actualMidi: number): number {
  return (actualMidi - Math.round(actualMidi)) * 100;
}
