// One-shot position cache for handing off playback time between VideoPreview
// and MiniMediaPlayer's hidden <video> element during channel switches and scrolling.
// The map holds at most 1 entry since only one video plays at a time.

const cache = new Map<string, number>();

export function getVideoPosition(url: string): number | undefined {
  const t = cache.get(url);
  if (t !== undefined) cache.delete(url);
  return t;
}

export function setVideoPosition(url: string, time: number): void {
  cache.set(url, time);
}

export function clearVideoPosition(url: string): void {
  cache.delete(url);
}
