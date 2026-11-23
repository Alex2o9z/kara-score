export type AudioPermissionState = 'idle' | 'starting' | 'running' | 'denied' | 'error';

export interface AudioEngineOptions {
  fftSize?: number;
}

export class AudioEngine {
  private readonly fftSize: number;
  private permissionState: AudioPermissionState = 'idle';
  private lastError: string | null = null;
  private isStarting = false;

  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private timeDomainBuffer: Float32Array<ArrayBuffer> | null = null;

  constructor(optionsOrFftSize: number | AudioEngineOptions = 2048) {
    if (typeof optionsOrFftSize === 'number') {
      this.fftSize = optionsOrFftSize;
    } else {
      this.fftSize = optionsOrFftSize?.fftSize ?? 2048;
    }
  }

  public isRunning(): boolean {
    return (
      this.permissionState === 'running' &&
      this.audioContext !== null &&
      this.audioContext.state !== 'closed'
    );
  }

  public getSampleRate(): number {
    return this.audioContext?.sampleRate ?? 44100;
  }

  public getPermissionState(): AudioPermissionState {
    return this.permissionState;
  }

  public getLastError(): string | null {
    return this.lastError;
  }

  public async start(): Promise<void> {
    // If already running, ensure resumed and exit cleanly
    if (this.permissionState === 'running' && this.audioContext) {
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }
      return;
    }

    if (this.isStarting) {
      return;
    }

    this.isStarting = true;
    this.permissionState = 'starting';
    this.lastError = null;

    try {
      if (
        typeof navigator === 'undefined' ||
        !navigator.mediaDevices ||
        typeof navigator.mediaDevices.getUserMedia !== 'function'
      ) {
        throw new Error(
          'Trình duyệt không hỗ trợ thu âm micro / Audio capture is not supported in this browser environment.'
        );
      }

      // 1. Request microphone: prefer raw audio constraints to avoid browser DSP distortion
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        });
      } catch {
        // Fallback to basic audio constraint if specific constraints fail
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }

      // 2. Initialize AudioContext
      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

      if (!AudioCtxClass) {
        throw new Error('Web Audio API is not supported in this browser.');
      }

      const ctx = new AudioCtxClass();
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      // 3. Connect MediaStreamAudioSourceNode -> AnalyserNode
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = this.fftSize;
      source.connect(analyser);

      // 4. Allocate reusable time-domain buffer
      const buffer = new Float32Array(
        new ArrayBuffer(analyser.fftSize * Float32Array.BYTES_PER_ELEMENT)
      );

      this.audioContext = ctx;
      this.mediaStream = stream;
      this.sourceNode = source;
      this.analyserNode = analyser;
      this.timeDomainBuffer = buffer;

      this.permissionState = 'running';
      this.lastError = null;
    } catch (err: unknown) {
      await this.stop();

      const error = err as Error;
      const errorName = error.name ?? '';

      if (
        errorName === 'NotAllowedError' ||
        errorName === 'PermissionDeniedError' ||
        errorName === 'SecurityError'
      ) {
        this.permissionState = 'denied';
        this.lastError =
          'Quyền truy cập micro đã bị từ chối / Microphone permission denied. Please allow microphone access in your browser settings.';
      } else if (errorName === 'NotFoundError' || errorName === 'DevicesNotFoundError') {
        this.permissionState = 'error';
        this.lastError =
          'Không tìm thấy thiết bị thu âm micro / No microphone input device found.';
      } else {
        this.permissionState = 'error';
        this.lastError =
          error.message ||
          'Lỗi khởi tạo thiết bị thu âm micro / Failed to initialize microphone capture.';
      }

      throw error;
    } finally {
      this.isStarting = false;
    }
  }

  public readTimeDomainSamples(): { samples: Float32Array<ArrayBuffer>; sampleRate: number } | null {
    if (!this.isRunning() || !this.analyserNode || !this.audioContext || !this.timeDomainBuffer) {
      return null;
    }

    this.analyserNode.getFloatTimeDomainData(this.timeDomainBuffer);
    return {
      samples: this.timeDomainBuffer,
      sampleRate: this.audioContext.sampleRate,
    };
  }

  public async stop(): Promise<void> {
    this.permissionState = 'idle';

    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch {
        // Safe disconnect
      }
      this.sourceNode = null;
    }

    if (this.analyserNode) {
      try {
        this.analyserNode.disconnect();
      } catch {
        // Safe disconnect
      }
      this.analyserNode = null;
    }

    if (this.mediaStream) {
      try {
        const tracks = this.mediaStream.getTracks();
        for (const track of tracks) {
          track.stop();
        }
      } catch {
        // Safe stop
      }
      this.mediaStream = null;
    }

    if (this.audioContext) {
      try {
        if (this.audioContext.state !== 'closed') {
          await this.audioContext.close();
        }
      } catch {
        // Safe close
      }
      this.audioContext = null;
    }

    this.timeDomainBuffer = null;
  }
}
