const VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

export function extractYouTubeVideoId(input: string): string | null {
  if (!input || typeof input !== 'string') {
    return null;
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  // 1. Check if input is directly a raw 11-character video ID
  if (VIDEO_ID_REGEX.test(trimmed)) {
    return trimmed;
  }

  // 2. Normalize protocol if missing for URL parsing
  let urlString = trimmed;
  if (!/^https?:\/\//i.test(urlString)) {
    urlString = `https://${urlString}`;
  }

  try {
    const url = new URL(urlString);
    const hostname = url.hostname.toLowerCase();

    // Check valid YouTube hosts
    const isYouTubeHost =
      hostname === 'youtube.com' ||
      hostname.endsWith('.youtube.com') ||
      hostname === 'youtu.be';

    if (!isYouTubeHost) {
      return null;
    }

    let candidateId: string | null = null;

    if (hostname === 'youtu.be') {
      // Path format: /<id>
      const pathParts = url.pathname.split('/').filter(Boolean);
      candidateId = pathParts[0] ?? null;
    } else {
      // Standard youtube.com paths
      if (url.pathname === '/watch') {
        candidateId = url.searchParams.get('v');
      } else if (url.pathname.startsWith('/embed/')) {
        const pathParts = url.pathname.split('/').filter(Boolean);
        candidateId = pathParts[1] ?? null;
      } else if (url.pathname.startsWith('/shorts/')) {
        const pathParts = url.pathname.split('/').filter(Boolean);
        candidateId = pathParts[1] ?? null;
      }
    }

    if (candidateId && VIDEO_ID_REGEX.test(candidateId)) {
      return candidateId;
    }

    return null;
  } catch {
    return null;
  }
}
