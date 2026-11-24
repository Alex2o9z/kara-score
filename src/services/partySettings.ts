import type { ScoreRating } from '../types/karaoke';

export type JudgeMode = 'standard' | 'lenient' | 'strict' | 'fun';

export interface KaraScoreSettings {
  judgeMode: JudgeMode;
  enableFunRemarks: boolean;
  autoMicOnPlay: boolean;
  showDebugHud: boolean;
}

export interface JudgePresentationResult {
  displayScore: number;
  displayRating: ScoreRating;
  judgeLabel: string;
  remark: string;
}

export const DEFAULT_SETTINGS: KaraScoreSettings = {
  judgeMode: 'standard',
  enableFunRemarks: true,
  autoMicOnPlay: true,
  showDebugHud: false,
};

export const SETTINGS_STORAGE_KEY = 'karascore_party_settings';

export const FUN_REMARKS: Record<ScoreRating, string[]> = {
  S: [
    'Giọng hát vàng trong làng karaoke, ca sĩ chính thức chào thua!',
    'Hát thế này thì quán karaoke phải trả lại tiền giờ hát luôn!',
    'Nốt cao vút, nốt trầm chuẩn, 10 điểm không có nhưng!',
    'Mic này sinh ra là để dành cho bạn rồi!',
    'Đỉnh chóp! Giọng hát làm rung chuyển cả phòng thu!',
  ],
  A: [
    'Hát hay ngất ngây, fan hâm mộ đứng xếp hàng xin chữ ký rồi!',
    'Gần đạt cảnh giới diva rồi đó, thêm tí cảm xúc là bùng nổ!',
    'Bắt nhịp chuẩn đét, cao độ mượt như đường đua F1!',
    'Phong độ rất ổn định, ban giám khảo gật gù liên tục!',
    'Rất mượt mà! Đoạn cao trào xử lý cực kỳ tự tin!',
  ],
  B: [
    'Hát rất có chất riêng, chỉ cần giữ hơi đều một chút nữa thôi!',
    'Nhạc đi đường nhạc, người đi đường người... nhưng đoạn điệp khúc kéo lại kịp!',
    'Giọng khỏe như lực sĩ, luyện thêm luyến láy là lên Hạng A ngay!',
    'Đạt chuẩn karaoke tiệc tùng rồi, chuẩn bị lên sân khấu lớn thôi!',
    'Có tố chất nghệ sĩ, cần tự tin đẩy giọng vang hơn nữa nhé!',
  ],
  C: [
    'Hát bằng cả đam mê, dù nốt nhạc có hơi lạc trôi về nơi xa!',
    'Tự tin là chính, điểm số chỉ là con số phù du thôi bạn ơi!',
    'Cần bổ sung một ly nước chanh và 15 phút luyện thanh gấp!',
    'Hát như đọc thơ nhưng được cái tinh thần nhiệt huyết 100 điểm!',
    'Đừng nản lòng! Hát karaoke vui là chính, quẩy hết mình đi nào!',
  ],
};

export const NEUTRAL_REMARKS: Record<ScoreRating, string> = {
  S: 'Xuất sắc! Giọng hát cực kỳ chuẩn xác và ổn định.',
  A: 'Rất tốt! Kỹ thuật bắt nhịp và cao độ chuẩn xác.',
  B: 'Đạt chuẩn! Duy trì nhịp tốt, cần thêm độ ổn định.',
  C: 'Cần luyện thêm! Hãy tự tin hát to, rõ ràng và bắt đúng nhịp.',
};

export function calculateRating(score: number): ScoreRating {
  if (score >= 90) return 'S';
  if (score >= 80) return 'A';
  if (score >= 70) return 'B';
  return 'C';
}

export function getJudgeLabel(mode: JudgeMode): string {
  switch (mode) {
    case 'lenient':
      return 'Giám khảo Dễ tính (+8%)';
    case 'strict':
      return 'Giám khảo Khó tính (-10%)';
    case 'fun':
      return 'Giám khảo Hài hước';
    case 'standard':
    default:
      return 'Chuẩn xác';
  }
}

export function applyJudgePresentation(
  rawScore: number,
  settings: KaraScoreSettings,
  options?: { seed?: number }
): JudgePresentationResult {
  const clampedRaw = Math.min(100, Math.max(0, Math.round(rawScore)));
  let displayScore: number;

  switch (settings.judgeMode) {
    case 'lenient':
      displayScore = Math.min(100, Math.max(0, Math.round(clampedRaw * 1.08)));
      break;
    case 'strict':
      displayScore = Math.min(100, Math.max(0, Math.round(clampedRaw * 0.90)));
      break;
    case 'fun':
    case 'standard':
    default:
      displayScore = clampedRaw;
      break;
  }

  const displayRating = calculateRating(displayScore);
  const judgeLabel = getJudgeLabel(settings.judgeMode);

  let remark: string;
  if (!settings.enableFunRemarks) {
    remark = NEUTRAL_REMARKS[displayRating];
  } else {
    const pool = FUN_REMARKS[displayRating];
    const index = typeof options?.seed === 'number'
      ? Math.abs(options.seed) % pool.length
      : Math.floor(Math.random() * pool.length);
    remark = pool[index];
  }

  return {
    displayScore,
    displayRating,
    judgeLabel,
    remark,
  };
}

export function loadPartySettings(): KaraScoreSettings {
  if (typeof window === 'undefined') return { ...DEFAULT_SETTINGS };
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<KaraScoreSettings>;
    return {
      judgeMode: ['standard', 'lenient', 'strict', 'fun'].includes(parsed.judgeMode as string)
        ? (parsed.judgeMode as JudgeMode)
        : DEFAULT_SETTINGS.judgeMode,
      enableFunRemarks: typeof parsed.enableFunRemarks === 'boolean'
        ? parsed.enableFunRemarks
        : DEFAULT_SETTINGS.enableFunRemarks,
      autoMicOnPlay: typeof parsed.autoMicOnPlay === 'boolean'
        ? parsed.autoMicOnPlay
        : DEFAULT_SETTINGS.autoMicOnPlay,
      showDebugHud: typeof parsed.showDebugHud === 'boolean'
        ? parsed.showDebugHud
        : DEFAULT_SETTINGS.showDebugHud,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function savePartySettings(settings: KaraScoreSettings): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Safe fallback
  }
}
