import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioEngine, type AudioPermissionState } from '../engines/AudioEngine';
import { PitchDetector } from '../engines/PitchDetector';
import { PitchSmoother } from '../engines/PitchSmoother';
import { ScoringEngine } from '../engines/ScoringEngine';
import { TimelineInterpolator } from '../engines/TimelineInterpolator';
import {
  type PlayerState,
  type RawPitchFrame,
  type ScoreSnapshot,
  type ScoringMode,
  type SmoothedPitchFrame,
  type SongData,
} from '../types/karaoke';
import {
  YouTubePlayerAdapter,
  type YouTubePlayerError,
} from '../services/YouTubePlayerAdapter';

export interface KaraokeSessionHook {
  // Session states
  playerState: PlayerState;
  mode: ScoringMode;
  activeSong: SongData | null;
  latencyOffsetMs: number;
  micStatus: AudioPermissionState;
  micError: string | null;
  ytError: YouTubePlayerError | null;
  pitch: SmoothedPitchFrame;
  score: ScoreSnapshot;
  interpolatedTimeMs: number;
  rawVideoTimeSec: number;
  sampleRate: number;
  isPlayerReady: boolean;

  // Actions
  attachPlayerContainer: (el: HTMLElement | null) => void;
  loadVideo: (videoId: string, song?: SongData | null) => void;
  startMic: () => Promise<void>;
  stopMic: () => Promise<void>;
  resetScore: () => void;
  setLatencyOffsetMs: (ms: number) => void;
  play: () => void;
  pause: () => void;
  seekTo: (seconds: number) => void;
}

const INITIAL_PITCH: SmoothedPitchFrame = {
  hz: null,
  midi: null,
  noteName: null,
  clarity: 0,
  rms: 0,
  isValid: false,
};

const INITIAL_SCORE: ScoreSnapshot = {
  mode: 'smart',
  score: 0,
  accuracyPct: 0,
  combo: 0,
  maxCombo: 0,
  targetMidi: null,
  centsDelta: null,
  activeTicks: 0,
  validVocalTicks: 0,
  breakdown: {
    inTuneAccuracy: 0,
    stabilityClarity: 0,
    activeVocalCoverage: 0,
    melodicVariety: 0,
  },
  rating: 'C',
};

export function useKaraokeSession(): KaraokeSessionHook {
  // Core pure engines persisted across renders
  const audioEngineRef = useRef<AudioEngine>(new AudioEngine(2048));
  const pitchDetectorRef = useRef<PitchDetector>(new PitchDetector());
  const pitchSmootherRef = useRef<PitchSmoother>(new PitchSmoother());
  const timelineInterpolatorRef = useRef<TimelineInterpolator>(new TimelineInterpolator(150));
  const scoringEngineRef = useRef<ScoringEngine>(new ScoringEngine('smart'));
  const playerAdapterRef = useRef<YouTubePlayerAdapter | null>(null);

  // Active video and container refs for StrictMode resilience
  const currentVideoIdRef = useRef<string | null>(null);
  const containerElRef = useRef<HTMLElement | null>(null);

  // Reactive states
  const [playerState, setPlayerState] = useState<PlayerState>('UNSTARTED');
  const [mode, setMode] = useState<ScoringMode>('smart');
  const [activeSong, setActiveSong] = useState<SongData | null>(null);
  const [latencyOffsetMs, setLatencyOffsetMsState] = useState<number>(0);
  const [micStatus, setMicStatus] = useState<AudioPermissionState>('idle');
  const [micError, setMicError] = useState<string | null>(null);
  const [ytError, setYtError] = useState<YouTubePlayerError | null>(null);
  const [pitch, setPitch] = useState<SmoothedPitchFrame>(INITIAL_PITCH);
  const [score, setScore] = useState<ScoreSnapshot>(INITIAL_SCORE);
  const [interpolatedTimeMs, setInterpolatedTimeMs] = useState<number>(0);
  const [rawVideoTimeSec, setRawVideoTimeSec] = useState<number>(0);
  const [sampleRate, setSampleRate] = useState<number>(44100);
  const [isPlayerReady, setIsPlayerReady] = useState<boolean>(false);

  // Sync refs for tick loop inside useEffect to adhere to React hooks/refs guidelines
  const playerStateRef = useRef<PlayerState>(playerState);
  useEffect(() => {
    playerStateRef.current = playerState;
  }, [playerState]);

  const latencyOffsetMsRef = useRef<number>(latencyOffsetMs);
  useEffect(() => {
    latencyOffsetMsRef.current = latencyOffsetMs;
  }, [latencyOffsetMs]);

  const activeSongRef = useRef<SongData | null>(activeSong);
  useEffect(() => {
    activeSongRef.current = activeSong;
  }, [activeSong]);

  // Latency offset setter
  const setLatencyOffsetMs = useCallback((ms: number) => {
    setLatencyOffsetMsState(ms);
  }, []);

  // Player container attachment with safe StrictMode mount/unmount handling
  const attachPlayerContainer = useCallback((el: HTMLElement | null) => {
    if (containerElRef.current === el && playerAdapterRef.current) {
      return;
    }

    if (playerAdapterRef.current) {
      playerAdapterRef.current.destroy();
      playerAdapterRef.current = null;
      setIsPlayerReady(false);
    }

    containerElRef.current = el;
    if (!el) {
      return;
    }

    playerAdapterRef.current = new YouTubePlayerAdapter(el, {
      videoId: currentVideoIdRef.current || undefined,
      onStateChange: (state: PlayerState) => {
        setPlayerState(state);
      },
      onError: (err: YouTubePlayerError) => {
        setYtError(err);
      },
      onReady: () => {
        setIsPlayerReady(true);
      },
    });
  }, []);

  // Video loader
  const loadVideo = useCallback((videoId: string, song?: SongData | null) => {
    currentVideoIdRef.current = videoId;
    const isSongMatch = song && song.youtubeVideoId === videoId;
    const targetSong = isSongMatch ? song : null;
    const targetMode: ScoringMode = isSongMatch ? 'exact' : 'smart';

    setActiveSong(targetSong);
    setMode(targetMode);
    setYtError(null);

    // Reconfigure scoring engine & reset timeline
    scoringEngineRef.current.configure(targetMode, targetSong ?? undefined);
    setScore(scoringEngineRef.current.getSnapshot());

    timelineInterpolatorRef.current.reset();
    setInterpolatedTimeMs(0);
    setRawVideoTimeSec(0);

    // Load video in adapter (will execute or queue until player is ready)
    if (playerAdapterRef.current) {
      playerAdapterRef.current.loadVideoById(videoId);
    }
  }, []);

  // Microphone lifecycle controls
  const startMic = useCallback(async () => {
    try {
      setMicStatus('starting');
      setMicError(null);
      await audioEngineRef.current.start();
      setMicStatus(audioEngineRef.current.getPermissionState());
      setMicError(audioEngineRef.current.getLastError());
      setSampleRate(audioEngineRef.current.getSampleRate());
    } catch (err) {
      setMicStatus(audioEngineRef.current.getPermissionState());
      setMicError(audioEngineRef.current.getLastError() || (err as Error).message);
    }
  }, []);

  const stopMic = useCallback(async () => {
    await audioEngineRef.current.stop();
    setMicStatus('idle');
    setMicError(null);
    setPitch(INITIAL_PITCH);
  }, []);

  // Reset score
  const resetScore = useCallback(() => {
    scoringEngineRef.current.reset();
    setScore(scoringEngineRef.current.getSnapshot());
  }, []);

  // Playback control delegates
  const play = useCallback(() => {
    playerAdapterRef.current?.play();
  }, []);

  const pause = useCallback(() => {
    playerAdapterRef.current?.pause();
  }, []);

  const seekTo = useCallback((seconds: number) => {
    playerAdapterRef.current?.seekTo(seconds);
  }, []);

  // 50ms tick loop
  const tick = useCallback(() => {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const player = playerAdapterRef.current;

    if (player && player.isPlayerReady()) {
      const rawSec = player.getCurrentTimeSec();
      const rate = player.getPlaybackRate();
      timelineInterpolatorRef.current.syncFromPlayer(
        rawSec,
        playerStateRef.current,
        rate,
        now
      );
      setRawVideoTimeSec(rawSec);
    }

    const interpolated = timelineInterpolatorRef.current.getInterpolatedTimeMs(now);
    setInterpolatedTimeMs(interpolated);

    // 1. Capture microphone audio samples
    const reading = audioEngineRef.current.readTimeDomainSamples();
    let rawPitch: RawPitchFrame;

    if (reading && reading.samples && reading.samples.length > 0) {
      rawPitch = pitchDetectorRef.current.detect(reading.samples, reading.sampleRate);
    } else {
      rawPitch = { hz: null, clarity: 0, rms: 0 };
    }

    // 2. Smooth pitch frame
    const smoothed = pitchSmootherRef.current.process(rawPitch);
    setPitch(smoothed);

    // 3. Process scoring tick
    const nextSnapshot = scoringEngineRef.current.tick({
      interpolatedTimeMs: interpolated,
      latencyOffsetMs: latencyOffsetMsRef.current,
      playerState: playerStateRef.current,
      pitch: smoothed,
      tickDurationMs: 50,
    });
    setScore(nextSnapshot);
  }, []);

  useEffect(() => {
    const audioEngine = audioEngineRef.current;
    const intervalId = window.setInterval(tick, 50);

    return () => {
      window.clearInterval(intervalId);
      void audioEngine.stop();
      if (playerAdapterRef.current) {
        playerAdapterRef.current.destroy();
        playerAdapterRef.current = null;
      }
    };
  }, [tick]);

  return {
    playerState,
    mode,
    activeSong,
    latencyOffsetMs,
    micStatus,
    micError,
    ytError,
    pitch,
    score,
    interpolatedTimeMs,
    rawVideoTimeSec,
    sampleRate,
    isPlayerReady,

    attachPlayerContainer,
    loadVideo,
    startMic,
    stopMic,
    resetScore,
    setLatencyOffsetMs,
    play,
    pause,
    seekTo,
  };
}
