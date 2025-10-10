/**
 * Notification sound utilities for playing audio notifications
 */

// Play notification sound based on current settings
export const playNotificationSound = async (globalSettings: {
  enableNotificationSounds: boolean;
  notificationSound: string;
  notificationVolume: number;
}) => {
  // Check if notification sounds are enabled and volume is not muted
  if (!globalSettings.enableNotificationSounds || globalSettings.notificationVolume === 0) {
    return;
  }

  try {
    let audioSrc: string;

    if (globalSettings.notificationSound) {
      // Play custom uploaded sound from URL string
      audioSrc = globalSettings.notificationSound;
    } else {
      // Play default notification sound using Web Audio API
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const audioContext = new AudioContextClass();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
      oscillator.type = "sine";

      // Apply the volume setting to the gain
      const volumeMultiplier = globalSettings.notificationVolume;
      gainNode.gain.setValueAtTime(0, audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(
        0.1 * volumeMultiplier,
        audioContext.currentTime + 0.01,
      );
      gainNode.gain.exponentialRampToValueAtTime(
        0.01 * volumeMultiplier,
        audioContext.currentTime + 0.5,
      );

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.5);
      return;
    }

    const audio = new Audio(audioSrc);
    audio.volume = globalSettings.notificationVolume; // Use the volume setting
    await audio.play();
  } catch (error) {
    console.error("Failed to play notification sound:", error);
    // Fallback to default browser notification sound or do nothing
  }
};

// Check if message should trigger a notification sound
export const shouldPlayNotificationSound = (
  message: { userId: string; content: string; type: string },
  currentUser: { username: string } | null,
  globalSettings: {
    enableHighlights: boolean;
    enableNotificationSounds: boolean;
    notificationVolume: number;
    customMentions: string[];
  },
): boolean => {
  // Don't play sound if notification sounds are disabled or volume is muted
  if (!globalSettings.enableNotificationSounds || globalSettings.notificationVolume === 0) {
    return false;
  }

  // Don't play sound for our own messages
  if (currentUser && message.userId === currentUser.username) {
    return false;
  }

  // Only check highlights for actual messages (PRIVMSG) and notices (NOTICE)
  const isUserMessage = message.type === "message";
  const isSystemMessage = ["system", "join", "part", "quit", "nick"].includes(
    message.type,
  );

  if (!isUserMessage || isSystemMessage) {
    return false; // Don't trigger sounds for system messages
  }

  // If highlights are enabled, check for mentions
  if (globalSettings.enableHighlights && currentUser) {
    const content = message.content.toLowerCase();

    // Check for username mention
    const usernameMention = content.includes(
      currentUser.username.toLowerCase(),
    );

    // Check for custom mentions
    const customMention = globalSettings.customMentions.some(
      (mention) => mention.trim() && content.includes(mention.toLowerCase()),
    );

    return usernameMention || customMention;
  }

  // If highlights are disabled, play sound for all user messages (except our own)
  return true;
};
