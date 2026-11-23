import type { PlayerState } from '../types/karaoke';

export interface YouTubePlayerError {
  code: number;
  isEmbedBlocked: boolean;
  message: string;
}

export interface YTPlayerVars {
  playsinline?: 0 | 1;
  rel?: 0 | 1;
  modestbranding?: 0 | 1;
  origin?: string;
  autoplay?: 0 | 1;
  controls?: 0 | 1;
  [key: string]: unknown;
}

export interface YTPlayerOptions {
  width?: string | number;
  height?: string | number;
  videoId?: string;
  playerVars?: YTPlayerVars;
  events?: {
    onReady?: (event: { target: YTPlayerInstance }) => void;
    onStateChange?: (event: { data: number; target: YTPlayerInstance }) => void;
    onError?: (event: { data: number; target: YTPlayerInstance }) => void;
  };
}

export interface YTPlayerInstance {
  playVideo(): void;
  pauseVideo(): void;
  stopVideo(): void;
  seekTo(seconds: number, allowSeekAhead?: boolean): void;
  loadVideoById(videoId: string): void;
  cueVideoById(videoId: string): void;
  getPlayerState(): number;
  getCurrentTime(): number;
  getDuration(): number;
  getPlaybackRate(): number;
  setPlaybackRate(suggestedRate: number): void;
  destroy(): void;
}

export interface YTNamespace {
  Player: new (element: HTMLElement | string, options: YTPlayerOptions) => YTPlayerInstance;
  PlayerState: {
    UNSTARTED: -1;
    ENDED: 0;
    PLAYING: 1;
    PAUSED: 2;
    BUFFERING: 3;
    CUED: 5;
  };
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

export function mapYTPlayerState(ytState: number): PlayerState {
  switch (ytState) {
    case 1:
      return 'PLAYING';
    case 2:
      return 'PAUSED';
    case 3:
      return 'BUFFERING';
    case 0:
      return 'ENDED';
    case -1:
    case 5:
    default:
      return 'UNSTARTED';
  }
}

export function mapYTError(code: number): YouTubePlayerError {
  let message: string;
  let isEmbedBlocked = false;

  switch (code) {
    case 2:
      message = 'Tham số URL hoặc mã video YouTube không hợp lệ / Invalid YouTube video ID.';
      break;
    case 5:
      message = 'Lỗi phát video HTML5 của trình phát YouTube / YouTube HTML5 player error.';
      break;
    case 100:
      message =
        'Video YouTube không tồn tại, đã bị xóa hoặc đặt ở chế độ riêng tư / Video not found, removed, or marked private.';
      break;
    case 101:
    case 150:
      isEmbedBlocked = true;
      message =
        'Chủ sở hữu video không cho phép nhúng video trên trang web khác / Video owner has disabled playback in embedded players.';
      break;
    default:
      message = `Lỗi trình phát YouTube (${code}) / YouTube player error occurred.`;
      break;
  }

  return {
    code,
    isEmbedBlocked,
    message,
  };
}

let apiLoadingPromise: Promise<void> | null = null;

export function loadYouTubeIframeApi(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.resolve();
  }

  // 1. If already available, resolve immediately
  if (window.YT && window.YT.Player) {
    return Promise.resolve();
  }

  // 2. If already in flight, reuse singleton promise
  if (apiLoadingPromise) {
    return apiLoadingPromise;
  }

  apiLoadingPromise = new Promise<void>((resolve, reject) => {
    const existingScript = document.querySelector('script[src*="youtube.com/iframe_api"]');

    const previousOnReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof previousOnReady === 'function') {
        try {
          previousOnReady();
        } catch {
          // Ignore previous callback failures
        }
      }
      resolve();
    };

    if (!existingScript) {
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.onerror = () => {
        apiLoadingPromise = null;
        reject(new Error('Failed to load YouTube IFrame API script.'));
      };
      document.head.appendChild(script);
    }
  });

  return apiLoadingPromise;
}

export interface YouTubePlayerAdapterOptions {
  videoId?: string;
  onStateChange?: (state: PlayerState) => void;
  onError?: (error: YouTubePlayerError) => void;
  onReady?: () => void;
}

export class YouTubePlayerAdapter {
  private player: YTPlayerInstance | null = null;
  private isReady = false;
  private currentState: PlayerState = 'UNSTARTED';
  private onStateChange?: (state: PlayerState) => void;
  private onError?: (error: YouTubePlayerError) => void;
  private onReadyCallback?: () => void;
  private isDestroyed = false;

  constructor(
    target: HTMLElement | string,
    options: YouTubePlayerAdapterOptions = {}
  ) {
    this.onStateChange = options.onStateChange;
    this.onError = options.onError;
    this.onReadyCallback = options.onReady;

    void this.initializePlayer(target, options.videoId);
  }

  private async initializePlayer(target: HTMLElement | string, videoId?: string): Promise<void> {
    try {
      await loadYouTubeIframeApi();

      if (this.isDestroyed || !window.YT || !window.YT.Player) {
        return;
      }

      const origin =
        typeof window !== 'undefined' && window.location
          ? window.location.origin
          : '';

      this.player = new window.YT.Player(target, {
        videoId,
        playerVars: {
          playsinline: 1,
          rel: 0,
          modestbranding: 1,
          origin,
        },
        events: {
          onReady: () => {
            if (this.isDestroyed) return;
            this.isReady = true;
            this.onReadyCallback?.();
          },
          onStateChange: (event: { data: number }) => {
            if (this.isDestroyed) return;
            this.currentState = mapYTPlayerState(event.data);
            this.onStateChange?.(this.currentState);
          },
          onError: (event: { data: number }) => {
            if (this.isDestroyed) return;
            const mapped = mapYTError(event.data);
            this.onError?.(mapped);
          },
        },
      });
    } catch (err) {
      if (!this.isDestroyed) {
        this.onError?.({
          code: -1,
          isEmbedBlocked: false,
          message: (err as Error).message || 'Failed to initialize YouTube player.',
        });
      }
    }
  }

  public loadVideoById(videoId: string): void {
    if (this.player && this.isReady && typeof this.player.loadVideoById === 'function') {
      this.player.loadVideoById(videoId);
    }
  }

  public play(): void {
    if (this.player && this.isReady && typeof this.player.playVideo === 'function') {
      this.player.playVideo();
    }
  }

  public pause(): void {
    if (this.player && this.isReady && typeof this.player.pauseVideo === 'function') {
      this.player.pauseVideo();
    }
  }

  public seekTo(seconds: number): void {
    if (this.player && this.isReady && typeof this.player.seekTo === 'function') {
      this.player.seekTo(Math.max(0, seconds), true);
    }
  }

  public getCurrentTimeSec(): number {
    if (this.player && this.isReady && typeof this.player.getCurrentTime === 'function') {
      const time = this.player.getCurrentTime();
      return Number.isFinite(time) ? Math.max(0, time) : 0;
    }
    return 0;
  }

  public getDurationSec(): number {
    if (this.player && this.isReady && typeof this.player.getDuration === 'function') {
      const duration = this.player.getDuration();
      return Number.isFinite(duration) ? Math.max(0, duration) : 0;
    }
    return 0;
  }

  public getPlaybackRate(): number {
    if (this.player && this.isReady && typeof this.player.getPlaybackRate === 'function') {
      const rate = this.player.getPlaybackRate();
      return Number.isFinite(rate) && rate > 0 ? rate : 1;
    }
    return 1;
  }

  public getState(): PlayerState {
    return this.currentState;
  }

  public isPlayerReady(): boolean {
    return this.isReady && !this.isDestroyed;
  }

  public destroy(): void {
    this.isDestroyed = true;
    this.isReady = false;
    this.onStateChange = undefined;
    this.onError = undefined;
    this.onReadyCallback = undefined;

    if (this.player && typeof this.player.destroy === 'function') {
      try {
        this.player.destroy();
      } catch {
        // Safe destroy
      }
      this.player = null;
    }
  }
}
