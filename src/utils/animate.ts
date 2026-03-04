export type AnimationPlaybackControlsWithThen = {
  finished: Promise<void>;
  stop: () => void;
};

type AnimateOptions = KeyframeAnimationOptions & {
  ease?: string | ((progress: number) => number);
  onComplete?: () => void;
};

export const animate = (
  element: Element,
  keyframes: Keyframe[] | PropertyIndexedKeyframes,
  options: AnimateOptions
): AnimationPlaybackControlsWithThen => {
  const { onComplete, ease, ...animationOptions } = options;
  const nextOptions: KeyframeAnimationOptions = { ...animationOptions };
  if (typeof ease === 'string' && ease.trim()) {
    nextOptions.easing = ease;
  }
  if (typeof nextOptions.duration === 'number' && nextOptions.duration > 0 && nextOptions.duration <= 10) {
    nextOptions.duration = nextOptions.duration * 1000;
  }

  const animation = element.animate(keyframes, nextOptions);
  let cancelled = false;

  const finished = animation.finished
    .then(() => {
      if (!cancelled) onComplete?.();
    })
    .catch(() => undefined);

  return {
    finished,
    stop: () => {
      cancelled = true;
      animation.cancel();
    },
  };
};
