import { motion } from 'framer-motion';
import { sceneTransitions } from '@/lib/video';

const points = '0,80 10,75 20,60 30,65 40,50 50,45 60,20 70,30 80,15 90,5 100,0';

function StatBox({ label, value, delay, color }: { label: string; value: string; delay: number; color: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8, filter: 'blur(10px)' }}
      animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
      transition={{ delay, duration: 0.6, type: 'spring', bounce: 0.4 }}
      className="border border-white/20 bg-black p-[1.5vw] flex flex-col items-center min-w-[22vw]"
    >
      <div className="font-mono text-[1.4vw] text-white/50 mb-[0.8vw] tracking-widest text-center">{label}</div>
      <div className="font-display font-black text-[4.5vw] leading-none" style={{ color }}>
        {value}
      </div>
    </motion.div>
  );
}

export function Scene4() {
  return (
    <motion.div
      className="absolute inset-0 bg-black text-white flex flex-col items-center justify-center overflow-hidden"
      variants={sceneTransitions.scaleFade}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      <div className="absolute inset-0 grid-bg opacity-20 pointer-events-none" />
      <div className="absolute inset-0 scanlines z-50 pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7 }}
        className="font-display font-bold text-[4.5vw] tracking-wider mb-[2.5vw] z-10 text-white"
      >
        TRACK REAL PROFIT OVER TIME
      </motion.div>

      {/* SVG line chart */}
      <div className="relative w-[72vw] h-[28vh] border-l-2 border-b-2 border-white/30 mb-[2.5vw] z-10">
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full overflow-visible"
        >
          <line x1="0" y1="25" x2="100" y2="25" stroke="white" strokeOpacity="0.07" strokeWidth="0.5" />
          <line x1="0" y1="50" x2="100" y2="50" stroke="white" strokeOpacity="0.07" strokeWidth="0.5" />
          <line x1="0" y1="75" x2="100" y2="75" stroke="white" strokeOpacity="0.07" strokeWidth="0.5" />

          {/* Red segment (early losses) */}
          <motion.polyline
            fill="none"
            stroke="#ff4444"
            strokeWidth="2.5"
            points="0,80 10,75 20,60 30,65 40,50"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ delay: 0.5, duration: 1.2, ease: 'easeInOut' }}
            style={{ filter: 'drop-shadow(0 0 6px rgba(255,68,68,0.8))' }}
          />

          {/* Green segment (profitable growth) */}
          <motion.polyline
            fill="none"
            stroke="#00ff41"
            strokeWidth="2.5"
            points="40,50 50,45 60,20 70,30 80,15 90,5 100,0"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ delay: 1.4, duration: 1.4, ease: 'easeInOut' }}
            style={{ filter: 'drop-shadow(0 0 8px rgba(0,255,65,0.9))' }}
          />
        </svg>
      </div>

      {/* Stats */}
      <div className="flex gap-[1.5vw] z-10">
        <StatBox label="WIN STRIKE RATE" value="18.4%" delay={1.5} color="#ff8c00" />
        <StatBox label="PLACE STRIKE RATE" value="52.1%" delay={2.2} color="#ff8c00" />
        <StatBox label="ROI" value="+24.5%" delay={2.9} color="#00ff41" />
      </div>
    </motion.div>
  );
}
