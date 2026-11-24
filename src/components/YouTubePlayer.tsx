import React from 'react';

// YouTube IFrame PlayerVars configuration with fs: 0 to suppress native YouTube fullscreen button
const YOUTUBE_PLAYER_VARS = {
  enablejsapi: 1,
  playsinline: 1,
  rel: 0,
  modestbranding: 1,
  fs: 0, // Disable YouTube's competing fullscreen button so KaraScore stage controls remain visible
} as const;

// Global interceptor ensuring window.YT.Player constructor always receives fs: 0
if (typeof window !== 'undefined') {
  const installFsInterceptor = () => {
    const yt = window.YT as unknown as {
      Player?: {
        new (el: HTMLElement | string, options: Record<string, unknown>): unknown;
        __fsPatched?: boolean;
      };
    };

    if (yt?.Player && !yt.Player.__fsPatched) {
      const OriginalPlayer = yt.Player;
      const PatchedPlayer = function (
        this: unknown,
        element: HTMLElement | string,
        options: { playerVars?: Record<string, unknown>; [key: string]: unknown } = {}
      ) {
        if (!options.playerVars) {
          options.playerVars = { ...YOUTUBE_PLAYER_VARS };
        } else {
          options.playerVars.fs = YOUTUBE_PLAYER_VARS.fs;
        }
        return Reflect.construct(OriginalPlayer, [element, options], this ? this.constructor : OriginalPlayer);
      } as unknown as typeof yt.Player;

      PatchedPlayer.__fsPatched = true;
      PatchedPlayer.prototype = OriginalPlayer.prototype;
      yt.Player = PatchedPlayer;
    }
  };

  if (window.YT && window.YT.Player) {
    installFsInterceptor();
  } else {
    const originalOnReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      installFsInterceptor();
      originalOnReady?.();
    };
  }
}

export interface YouTubePlayerProps {
  attachPlayerContainer: (el: HTMLDivElement | null) => void;
  isFullscreen: boolean;
}

export const YouTubePlayer: React.FC<YouTubePlayerProps> = ({
  attachPlayerContainer,
  isFullscreen,
}) => {
  return (
    <div
      className={
        isFullscreen
          ? 'w-full h-full absolute inset-0 bg-black flex items-center justify-center'
          : 'w-full flex-1 min-h-0 flex items-center justify-center'
      }
    >
      <div
        className={
          isFullscreen
            ? 'w-full h-full'
            : 'w-full max-w-6xl mx-auto aspect-video rounded-2xl overflow-hidden bg-black shadow-2xl border border-zinc-800 max-h-full'
        }
      >
        <div
          ref={attachPlayerContainer}
          className="w-full h-full"
          id="youtube-player"
          data-fs="0"
        />
      </div>
    </div>
  );
};
