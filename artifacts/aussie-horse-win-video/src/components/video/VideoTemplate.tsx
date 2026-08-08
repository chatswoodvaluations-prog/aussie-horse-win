import { useVideoPlayer } from '@/lib/video';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef } from 'react';

import { Scene1 } from './video_scenes/Scene1';
import { Scene2 } from './video_scenes/Scene2';
import { Scene3 } from './video_scenes/Scene3';
import { Scene4 } from './video_scenes/Scene4';
import { Scene5 } from './video_scenes/Scene5';

export const SCENE_DURATIONS: Record<string, number> = {
  scene1: 6000,
  scene2: 8000,
  scene3: 6000,
  scene4: 6000,
  scene5: 6000,
};

const SCENE_COMPONENTS: Record<string, React.ComponentType> = {
  scene1: Scene1,
  scene2: Scene2,
  scene3: Scene3,
  scene4: Scene4,
  scene5: Scene5,
};

const SCENE_START_SEC: Record<string, number> = (() => {
  const out: Record<string, number> = {};
  let cumulativeMs = 0;
  for (const [key, ms] of Object.entries(SCENE_DURATIONS)) {
    out[key] = cumulativeMs / 1000;
    cumulativeMs += ms;
  }
  return out;
})();

const AUDIO_SEEK_EPSILON_SEC = 0.18;

export default function VideoTemplate({
  durations = SCENE_DURATIONS,
  loop = true,
  muted = false,
  onSceneChange,
}: {
  durations?: Record<string, number>;
  loop?: boolean;
  muted?: boolean;
  onSceneChange?: (sceneKey: string) => void;
} = {}) {
  const { currentScene, currentSceneKey } = useVideoPlayer({ durations, loop });

  useEffect(() => {
    onSceneChange?.(currentSceneKey);
  }, [currentSceneKey, onSceneChange]);

  const baseSceneKey = currentSceneKey.replace(/_r[12]$/, '');
  const sceneIndex = Object.keys(SCENE_DURATIONS).indexOf(baseSceneKey);
  const SceneComponent = SCENE_COMPONENTS[baseSceneKey];

  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = 0.45;
    const targetTime = SCENE_START_SEC[baseSceneKey] ?? 0;
    if (Math.abs(audio.currentTime - targetTime) > AUDIO_SEEK_EPSILON_SEC) {
      audio.currentTime = targetTime;
    }
    audio.play().catch(() => {});
  }, [currentSceneKey, baseSceneKey, muted]);

  return (
    <div
      className="w-full h-full overflow-hidden relative"
      style={{ backgroundColor: 'var(--color-bg-dark)' }}
    >
      <AnimatePresence mode="popLayout">
        {SceneComponent && <SceneComponent key={currentSceneKey} />}
      </AnimatePresence>

      {/* Horse galloping across — persistent element, runs 3× during the 32s loop */}
      <motion.div
        className="absolute z-40 pointer-events-none"
        style={{ bottom: '18%', left: 0 }}
        animate={{ x: ['-28vw', '115vw'] }}
        transition={{
          duration: 3.2,
          repeat: Infinity,
          repeatDelay: 7.5,
          ease: 'linear',
        }}
      >
        {/* Dust shadow beneath the horse */}
        <motion.div
          className="absolute bottom-0 left-[10%] right-[10%] h-[1.5vw] rounded-full"
          style={{
            background: 'radial-gradient(ellipse, rgba(0,255,65,0.18) 0%, transparent 70%)',
            filter: 'blur(6px)',
          }}
          animate={{ scaleX: [0.8, 1.1, 0.8], opacity: [0.4, 0.7, 0.4] }}
          transition={{ duration: 0.5, repeat: Infinity, ease: 'easeInOut' }}
        />
        <img
          src={`${import.meta.env.BASE_URL}images/horse.png`}
          alt=""
          style={{ width: '24vw', height: 'auto', display: 'block', filter: 'drop-shadow(0 0 12px rgba(0,255,65,0.35))' }}
        />
      </motion.div>

      <audio
        ref={audioRef}
        src={`${import.meta.env.BASE_URL}audio/bg_music.mp3`}
        preload="auto"
        autoPlay
        muted={muted}
      />
    </div>
  );
}
