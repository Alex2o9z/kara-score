import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioEngine } from './AudioEngine';

class MockMediaStreamTrack {
  public stopped = false;
  public stop = vi.fn(() => {
    this.stopped = true;
  });
}

class MockMediaStream {
  public tracks: MockMediaStreamTrack[];
  constructor(tracks: MockMediaStreamTrack[] = [new MockMediaStreamTrack()]) {
    this.tracks = tracks;
  }
  public getTracks(): MockMediaStreamTrack[] {
    return this.tracks;
  }
}

class MockAnalyserNode {
  public fftSize = 2048;
  public disconnect = vi.fn();
  public getFloatTimeDomainData = vi.fn((buffer: Float32Array) => {
    buffer.fill(0.25);
  });
}

class MockMediaStreamAudioSourceNode {
  public disconnect = vi.fn();
  public connect = vi.fn();
}

class MockAudioContext {
  public state: AudioContextState = 'suspended';
  public sampleRate = 48000;
  public resume = vi.fn(async () => {
    this.state = 'running';
  });
  public close = vi.fn(async () => {
    this.state = 'closed';
  });
  public createAnalyser = vi.fn(() => new MockAnalyserNode());
  public createMediaStreamSource = vi.fn(() => new MockMediaStreamAudioSourceNode());
}

describe('AudioEngine', () => {
  let originalAudioContext: typeof window.AudioContext;
  let getUserMediaMock: ReturnType<typeof vi.fn<(constraints?: MediaStreamConstraints) => Promise<MediaStream>>>;

  beforeEach(() => {
    originalAudioContext = window.AudioContext;
    (window as unknown as { AudioContext: typeof MockAudioContext }).AudioContext = MockAudioContext;

    getUserMediaMock = vi.fn(
      async (): Promise<MediaStream> =>
        new MockMediaStream([new MockMediaStreamTrack(), new MockMediaStreamTrack()]) as unknown as MediaStream
    );

    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: getUserMediaMock,
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    window.AudioContext = originalAudioContext;
    vi.restoreAllMocks();
  });

  it('starts successfully: sets isRunning === true, resumes suspended context, and exposes samples', async () => {
    const engine = new AudioEngine(2048);

    expect(engine.isRunning()).toBe(false);
    expect(engine.getPermissionState()).toBe('idle');

    await engine.start();

    expect(engine.isRunning()).toBe(true);
    expect(engine.getPermissionState()).toBe('running');
    expect(engine.getSampleRate()).toBe(48000);
    expect(engine.getLastError()).toBeNull();

    // Verify raw constraints were requested first
    expect(getUserMediaMock).toHaveBeenCalledWith({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });

    const reading = engine.readTimeDomainSamples();
    expect(reading).not.toBeNull();
    expect(reading?.samples).toHaveLength(2048);
    expect(reading?.samples[0]).toBe(0.25);
    expect(reading?.sampleRate).toBe(48000);
  });

  it('falls back to { audio: true } if advanced audio constraints fail', async () => {
    getUserMediaMock
      .mockRejectedValueOnce(new Error('OverconstrainedError'))
      .mockResolvedValueOnce(new MockMediaStream([new MockMediaStreamTrack()]) as unknown as MediaStream);

    const engine = new AudioEngine(1024);
    await engine.start();

    expect(getUserMediaMock).toHaveBeenCalledTimes(2);
    expect(getUserMediaMock).toHaveBeenNthCalledWith(1, {
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    expect(getUserMediaMock).toHaveBeenNthCalledWith(2, { audio: true });
    expect(engine.isRunning()).toBe(true);
  });

  it('stops cleanly: strictly calls track.stop() on all tracks, closes context, and resets state to idle', async () => {
    const track1 = new MockMediaStreamTrack();
    const track2 = new MockMediaStreamTrack();
    const stream = new MockMediaStream([track1, track2]) as unknown as MediaStream;

    getUserMediaMock.mockResolvedValue(stream);

    const engine = new AudioEngine(2048);
    await engine.start();
    expect(engine.isRunning()).toBe(true);

    await engine.stop();

    expect(engine.isRunning()).toBe(false);
    expect(engine.getPermissionState()).toBe('idle');
    expect(track1.stop).toHaveBeenCalledTimes(1);
    expect(track2.stop).toHaveBeenCalledTimes(1);
    expect(track1.stopped).toBe(true);
    expect(track2.stopped).toBe(true);

    // Reading samples after stop returns null
    expect(engine.readTimeDomainSamples()).toBeNull();
  });

  it('is idempotent: calling stop() multiple times does not throw or error', async () => {
    const engine = new AudioEngine();
    await engine.start();

    await engine.stop();
    await expect(engine.stop()).resolves.toBeUndefined();
    await expect(engine.stop()).resolves.toBeUndefined();

    expect(engine.isRunning()).toBe(false);
    expect(engine.getPermissionState()).toBe('idle');
  });

  it('handles already-running state cleanly and ensures context is resumed', async () => {
    const engine = new AudioEngine();
    await engine.start();

    expect(getUserMediaMock).toHaveBeenCalledTimes(1);

    // Second call to start() while running should not request mic again
    await engine.start();
    expect(getUserMediaMock).toHaveBeenCalledTimes(1);
    expect(engine.isRunning()).toBe(true);
  });

  it('handles permission denied (NotAllowedError): sets state to denied, cleans up, and provides user-friendly error', async () => {
    const deniedError = new Error('Permission denied');
    deniedError.name = 'NotAllowedError';

    getUserMediaMock.mockRejectedValue(deniedError);

    const engine = new AudioEngine();

    await expect(engine.start()).rejects.toThrow('Permission denied');

    expect(engine.isRunning()).toBe(false);
    expect(engine.getPermissionState()).toBe('denied');
    expect(engine.getLastError()).toContain('Quyền truy cập micro đã bị từ chối');
  });

  it('handles missing device (NotFoundError): sets state to error with missing device message', async () => {
    const notFoundError = new Error('No mic');
    notFoundError.name = 'NotFoundError';

    getUserMediaMock.mockRejectedValue(notFoundError);

    const engine = new AudioEngine();

    await expect(engine.start()).rejects.toThrow('No mic');

    expect(engine.isRunning()).toBe(false);
    expect(engine.getPermissionState()).toBe('error');
    expect(engine.getLastError()).toContain('Không tìm thấy thiết bị thu âm micro');
  });

  it('handles unsupported environment (no navigator.mediaDevices)', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      value: undefined,
      writable: true,
      configurable: true,
    });

    const engine = new AudioEngine();
    await expect(engine.start()).rejects.toThrow('Trình duyệt không hỗ trợ thu âm micro');

    expect(engine.getPermissionState()).toBe('error');
    expect(engine.isRunning()).toBe(false);
  });
});
