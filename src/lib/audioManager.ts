// Singleton Audio element that lives outside the React lifecycle.
// Because it is never destroyed, audio playback (src, currentTime, play state)
// survives component unmount/remount cycles caused by layout-mode changes on resize.
let _audio: HTMLAudioElement | null = null;

export function getAudio(): HTMLAudioElement {
  if (!_audio) {
    _audio = new Audio();
  }
  return _audio;
}
