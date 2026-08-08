import { ChevronDown, ChevronUp, Monitor, Repeat, Smartphone, Volume2, VolumeX } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import VideoTemplate, { SCENE_DURATIONS } from './VideoTemplate';
import { useSceneControls } from './useSceneControls';

const PROGRESS_TICK_MS = 60;
type ViewMode = 'desktop' | 'mobile';

// ─── Progress segments ────────────────────────────────────────────────────────

function ProgressSegments({
  sceneKeys,
  activeIndex,
  activeDuration,
  tick,
  onJumpTo,
  compact = false,
}: {
  sceneKeys: string[];
  activeIndex: number;
  activeDuration: number;
  tick: number;
  onJumpTo: (index: number) => void;
  compact?: boolean;
}) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    setElapsed(0);
    const start = performance.now();
    const id = window.setInterval(() => {
      setElapsed(performance.now() - start);
    }, PROGRESS_TICK_MS);
    return () => window.clearInterval(id);
  }, [tick]);

  const progress = activeDuration > 0 ? Math.min(1, elapsed / activeDuration) : 0;
  const segH = compact ? 'h-1.5' : 'h-3';

  return (
    <div className="flex-1 flex items-center gap-1">
      {sceneKeys.map((key, i) => {
        const isActive = i === activeIndex;
        const fill = isActive ? progress * 100 : 0;
        return (
          <button
            key={key}
            onClick={() => onJumpTo(i)}
            className={`flex-1 ${segH} bg-white/20 rounded-full overflow-hidden cursor-pointer hover:bg-white/30 transition-all relative`}
            aria-label={`Jump to scene ${i + 1}`}
            aria-current={isActive ? 'true' : undefined}
          >
            <div
              className="absolute inset-y-0 left-0 bg-white/90 rounded-full transition-[width] duration-100"
              style={{ width: `${fill}%` }}
            />
          </button>
        );
      })}
    </div>
  );
}

// ─── Control bar (desktop overlay variant) ───────────────────────────────────

interface ControlBarProps {
  visible: boolean;
  collapsed: boolean;
  locked: boolean;
  muted: boolean;
  sceneKeys: string[];
  activeIndex: number;
  activeDuration: number;
  tick: number;
  onToggleLock: () => void;
  onToggleMute: () => void;
  onJumpTo: (index: number) => void;
  onToggleCollapsed: () => void;
}

function OverlayControlBar({
  visible,
  collapsed,
  locked,
  muted,
  sceneKeys,
  activeIndex,
  activeDuration,
  tick,
  onToggleLock,
  onToggleMute,
  onJumpTo,
  onToggleCollapsed,
}: ControlBarProps) {
  return (
    <div
      className={`flex items-center gap-3 bg-black/50 backdrop-blur-sm px-5 py-4 transition-all duration-200 ease-out ${
        visible
          ? 'translate-y-0 opacity-100 pointer-events-auto'
          : 'translate-y-full opacity-0 pointer-events-none'
      }`}
      aria-hidden={!visible}
    >
      <IconBtn onClick={onToggleLock} active={locked} title={locked ? 'Loop: on' : 'Loop: off'} aria-pressed={locked}>
        <Repeat className="w-8 h-8" />
      </IconBtn>
      <IconBtn onClick={onToggleMute} active={!muted} title={muted ? 'Unmute' : 'Mute'} aria-pressed={!muted}>
        {muted ? <VolumeX className="w-8 h-8" /> : <Volume2 className="w-8 h-8" />}
      </IconBtn>
      <div className="w-px self-stretch bg-white/15" />
      <ProgressSegments
        sceneKeys={sceneKeys}
        activeIndex={activeIndex}
        activeDuration={activeDuration}
        tick={tick}
        onJumpTo={onJumpTo}
      />
      <div className="text-xl text-white/60 font-mono tabular-nums shrink-0">
        {activeIndex + 1}/{sceneKeys.length}
      </div>
      <IconBtn onClick={onToggleCollapsed} title={collapsed ? 'Show controls' : 'Hide controls'} aria-expanded={!collapsed}>
        {collapsed ? <ChevronUp className="w-10 h-10" /> : <ChevronDown className="w-10 h-10" />}
      </IconBtn>
    </div>
  );
}

// ─── Control bar (mobile compact variant) ────────────────────────────────────

function MobileControlBar({
  locked,
  muted,
  sceneKeys,
  activeIndex,
  activeDuration,
  tick,
  onToggleLock,
  onToggleMute,
  onJumpTo,
}: Omit<ControlBarProps, 'visible' | 'collapsed' | 'onToggleCollapsed'>) {
  return (
    <div className="flex items-center gap-2 bg-black px-3 py-2.5">
      <SmallIconBtn onClick={onToggleLock} active={locked} title={locked ? 'Loop: on' : 'Loop: off'}>
        <Repeat className="w-4 h-4" />
      </SmallIconBtn>
      <SmallIconBtn onClick={onToggleMute} active={!muted} title={muted ? 'Unmute' : 'Mute'}>
        {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
      </SmallIconBtn>
      <div className="w-px self-stretch bg-white/15" />
      <ProgressSegments
        sceneKeys={sceneKeys}
        activeIndex={activeIndex}
        activeDuration={activeDuration}
        tick={tick}
        onJumpTo={onJumpTo}
        compact
      />
      <div className="text-[11px] text-white/50 font-mono tabular-nums shrink-0">
        {activeIndex + 1}/{sceneKeys.length}
      </div>
    </div>
  );
}

// ─── Shared button primitives ─────────────────────────────────────────────────

function IconBtn({
  onClick,
  active,
  title,
  children,
  ...rest
}: {
  onClick: () => void;
  active?: boolean;
  title: string;
  children: React.ReactNode;
  [k: string]: unknown;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`w-14 h-14 flex items-center justify-center rounded-lg shrink-0 transition-colors ${
        active ? 'text-white bg-white/15 hover:bg-white/25' : 'text-white/60 hover:text-white hover:bg-white/10'
      }`}
      {...rest}
    >
      {children}
    </button>
  );
}

function SmallIconBtn({
  onClick,
  active,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`w-8 h-8 flex items-center justify-center rounded-md shrink-0 transition-colors ${
        active ? 'text-white bg-white/15 hover:bg-white/25' : 'text-white/50 hover:text-white hover:bg-white/10'
      }`}
    >
      {children}
    </button>
  );
}

// ─── View mode toggle ─────────────────────────────────────────────────────────

function ViewToggle({
  viewMode,
  setViewMode,
}: {
  viewMode: ViewMode;
  setViewMode: (m: ViewMode) => void;
}) {
  return (
    <div className="flex items-center gap-1 bg-black/60 backdrop-blur-sm border border-white/10 rounded-xl p-1">
      <button
        onClick={() => setViewMode('desktop')}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-mono tracking-wide transition-all ${
          viewMode === 'desktop'
            ? 'bg-[#00ff41]/15 text-[#00ff41] border border-[#00ff41]/30'
            : 'text-white/50 hover:text-white hover:bg-white/5'
        }`}
      >
        <Monitor className="w-4 h-4" />
        Desktop
      </button>
      <button
        onClick={() => setViewMode('mobile')}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-mono tracking-wide transition-all ${
          viewMode === 'mobile'
            ? 'bg-[#00ff41]/15 text-[#00ff41] border border-[#00ff41]/30'
            : 'text-white/50 hover:text-white hover:bg-white/5'
        }`}
      >
        <Smartphone className="w-4 h-4" />
        Mobile
      </button>
    </div>
  );
}

// ─── Phone frame ──────────────────────────────────────────────────────────────

// Dimensions (logical px — we scale to fit viewport)
const PHONE_W = 393;
const VIDEO_H = Math.round(PHONE_W * (9 / 16)); // 221
const STATUS_H = 44;
const CONTROLS_H = 46;
const HOME_H = 30;
const PHONE_H = STATUS_H + VIDEO_H + CONTROLS_H + HOME_H; // 341

function PhoneFrame({
  children,
  controlBar,
}: {
  children: React.ReactNode;
  controlBar: React.ReactNode;
}) {
  // Scale the phone to fit inside the viewport with breathing room
  const [scale, setScale] = useState(1);
  useEffect(() => {
    function calc() {
      const availW = window.innerWidth * 0.9;
      const availH = (window.innerHeight - 80) * 0.92; // 80 = toggle bar height
      const s = Math.min(availW / PHONE_W, availH / PHONE_H, 1.4);
      setScale(s);
    }
    calc();
    window.addEventListener('resize', calc);
    return () => window.removeEventListener('resize', calc);
  }, []);

  return (
    <div
      style={{
        width: PHONE_W,
        height: PHONE_H,
        transform: `scale(${scale})`,
        transformOrigin: 'top center',
        flexShrink: 0,
      }}
      className="relative rounded-[3.5rem] overflow-hidden border-[5px] border-zinc-700 shadow-[0_0_80px_rgba(0,255,65,0.12),0_30px_60px_rgba(0,0,0,0.8)] bg-black"
    >
      {/* Status bar */}
      <div
        className="flex items-center justify-between px-7 bg-black text-white/80 font-mono text-[11px] tracking-wide"
        style={{ height: STATUS_H }}
      >
        <span>9:41</span>
        {/* Dynamic island */}
        <div className="absolute left-1/2 -translate-x-1/2 top-3 w-24 h-7 bg-black rounded-full border border-zinc-800" />
        <div className="flex items-center gap-1.5">
          <svg viewBox="0 0 16 12" className="w-4 h-3 fill-white/80">
            <rect x="0" y="3" width="3" height="9" rx="0.5" />
            <rect x="4.5" y="2" width="3" height="10" rx="0.5" />
            <rect x="9" y="0.5" width="3" height="11.5" rx="0.5" />
            <rect x="13.5" y="0" width="2" height="12" rx="0.5" opacity="0.3" />
          </svg>
          <svg viewBox="0 0 24 12" className="w-5 h-3 fill-white/80">
            <rect x="0" y="0" width="21" height="12" rx="2" opacity="0.3" />
            <rect x="1" y="1" width="17" height="10" rx="1.5" />
            <rect x="22" y="3.5" width="2" height="5" rx="1" opacity="0.5" />
          </svg>
        </div>
      </div>

      {/* Video area */}
      <div className="relative bg-black overflow-hidden" style={{ height: VIDEO_H, width: PHONE_W }}>
        {children}
      </div>

      {/* Controls */}
      {controlBar}

      {/* Home indicator */}
      <div className="flex items-center justify-center bg-black" style={{ height: HOME_H }}>
        <div className="w-28 h-1 bg-white/25 rounded-full" />
      </div>
    </div>
  );
}

// ─── Root component ───────────────────────────────────────────────────────────

export default function VideoWithControls() {
  const isIframed = typeof window !== 'undefined' && window.self !== window.top;

  const {
    sceneKeys,
    activeIndex,
    locked,
    mountKey,
    tick,
    durations,
    activeDuration,
    onSceneChange,
    jumpTo,
    toggleLock,
  } = useSceneControls(SCENE_DURATIONS);

  const [viewMode, setViewMode] = useState<ViewMode>('desktop');
  const [collapsed, setCollapsed] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [tapPinned, setTapPinned] = useState(false);
  const [muted, setMuted] = useState(true);

  const sensorRef = useRef<HTMLDivElement | null>(null);

  const handlePointerEnter = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse') setHovering(true);
  }, []);
  const handlePointerLeave = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse') setHovering(false);
  }, []);
  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType === 'mouse') return;
      if (collapsed) setTapPinned(true);
    },
    [collapsed],
  );
  const handleToggleCollapsed = useCallback(() => {
    setCollapsed((c) => {
      if (!c) {
        setHovering(false);
        setTapPinned(false);
      }
      return !c;
    });
  }, []);

  useEffect(() => {
    if (!(collapsed && tapPinned)) return;
    const onDocPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      const sensor = sensorRef.current;
      if (sensor && !sensor.contains(e.target as Node)) setTapPinned(false);
    };
    document.addEventListener('pointerdown', onDocPointerDown);
    return () => document.removeEventListener('pointerdown', onDocPointerDown);
  }, [collapsed, tapPinned]);

  const barVisible = !collapsed || hovering || tapPinned;

  const controlProps = {
    locked,
    muted,
    sceneKeys,
    activeIndex,
    activeDuration,
    tick,
    onToggleLock: toggleLock,
    onToggleMute: () => setMuted((m) => !m),
    onJumpTo: jumpTo,
  };

  // Export path — no controls, audio unmuted, full screen
  if (!isIframed) return <div className="w-full h-screen"><VideoTemplate /></div>;

  // ── Mobile view ─────────────────────────────────────────────────────────────
  if (viewMode === 'mobile') {
    return (
      <div className="w-full h-screen bg-zinc-950 flex flex-col items-center overflow-hidden">
        {/* Toggle */}
        <div className="shrink-0 flex items-center justify-center py-4">
          <ViewToggle viewMode={viewMode} setViewMode={setViewMode} />
        </div>

        {/* Phone */}
        <div className="flex-1 flex items-start justify-center pt-2">
          <PhoneFrame
            controlBar={
              <MobileControlBar
                {...controlProps}
                onToggleMute={() => setMuted((m) => !m)}
              />
            }
          >
            <VideoTemplate
              key={mountKey}
              durations={durations}
              loop
              muted={muted}
              onSceneChange={onSceneChange}
            />
          </PhoneFrame>
        </div>
      </div>
    );
  }

  // ── Desktop view (default) ──────────────────────────────────────────────────
  return (
    <div className="relative w-full h-screen">
      {/* Toggle — top-right corner */}
      <div className="absolute top-4 right-4 z-50">
        <ViewToggle viewMode={viewMode} setViewMode={setViewMode} />
      </div>

      <VideoTemplate
        key={mountKey}
        durations={durations}
        loop
        muted={muted}
        onSceneChange={onSceneChange}
      />

      <div
        ref={sensorRef}
        className="absolute bottom-0 left-0 right-0 z-50 flex flex-col justify-end"
        style={{ height: '25%' }}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        onPointerDown={handlePointerDown}
      >
        <div className="flex-1 w-full" aria-hidden="true" />
        <OverlayControlBar
          visible={barVisible}
          collapsed={collapsed}
          locked={locked}
          muted={muted}
          sceneKeys={sceneKeys}
          activeIndex={activeIndex}
          activeDuration={activeDuration}
          tick={tick}
          onToggleLock={toggleLock}
          onToggleMute={() => setMuted((m) => !m)}
          onJumpTo={jumpTo}
          onToggleCollapsed={handleToggleCollapsed}
        />
      </div>
    </div>
  );
}
