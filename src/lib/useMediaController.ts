import { useEffect, useRef } from "react";
import useStore from "../store";

export interface UseMediaControllerOptions {
  url: string;
  type: "video" | "audio" | "embed";
  thumbnailUrl?: string;
  msgid?: string;
  serverId?: string;
  channelId?: string;
  onExternalStop?: () => void;
  onExternalPause?: () => void;
  inlineVisibility?: {
    getPosition?: () => number | undefined;
  };
  stopOnUnmount?: boolean;
}

export interface UseMediaControllerResult {
  isActive: boolean;
  isPlaying: boolean;
  play: () => void;
  pause: () => void;
  stop: () => void;
}

export function useMediaController(
  options: UseMediaControllerOptions,
): UseMediaControllerResult {
  const {
    url,
    type,
    thumbnailUrl,
    msgid,
    serverId,
    channelId,
    onExternalStop,
    onExternalPause,
    inlineVisibility,
    stopOnUnmount = false,
  } = options;

  const activeMedia = useStore((s) => s.ui.activeMedia);
  const isActive = activeMedia?.url === url && activeMedia?.type === type;
  const isPlaying = isActive && activeMedia?.isPlaying === true;

  const onExternalStopRef = useRef(onExternalStop);
  onExternalStopRef.current = onExternalStop;
  const onExternalPauseRef = useRef(onExternalPause);
  onExternalPauseRef.current = onExternalPause;

  const prevActiveRef = useRef(false);
  const prevPlayingRef = useRef(false);

  useEffect(() => {
    const wasActive = prevActiveRef.current;
    prevActiveRef.current = isActive;

    if (wasActive && !isActive) {
      // This player was displaced or the mini player was closed.
      onExternalStopRef.current?.();
      prevPlayingRef.current = false;
      return;
    }

    if (isActive) {
      const wasPlaying = prevPlayingRef.current;
      prevPlayingRef.current = isPlaying;
      if (wasPlaying && !isPlaying) {
        // Still active but paused externally — don't fire if stop already fired.
        onExternalPauseRef.current?.();
      }
    }
  }, [isActive, isPlaying]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: store actions have unstable refs
  useEffect(() => {
    if (inlineVisibility === undefined) return;
    if (!isActive) return;
    useStore.getState().setMediaInlineVisible(true);
    return () => {
      const pos = inlineVisibility.getPosition?.();
      useStore.getState().setMediaInlineVisible(false, pos);
    };
  }, [isActive, url, inlineVisibility !== undefined]);

  // Stop the store entry when this component unmounts while active (SoundCloud).
  useEffect(() => {
    if (!stopOnUnmount) return;
    return () => {
      if (useStore.getState().ui.activeMedia?.url === url) {
        useStore.getState().stopActiveMedia();
      }
    };
  }, [url, stopOnUnmount]);

  const play = () =>
    useStore
      .getState()
      .playMedia(url, type, thumbnailUrl, msgid, serverId, channelId);

  const pause = () => useStore.getState().pauseActiveMedia();

  const stop = () => useStore.getState().stopActiveMedia();

  return { isActive, isPlaying, play, pause, stop };
}
