import { motion } from 'framer-motion';
import { sceneTransitions } from '@/lib/video';

export function Scene4() {
  // Chart points
  const points = [
    "0,80", "10,75", "20,60", "30,65", "40,50", "50,45", "60,20", "70,30", "80,15", "90,5", "100,0"
  ].join(" ");

  return (
    <motion.div
      className="absolute inset-0 bg-bg-dark text-text-primary flex flex-col items-center justify-center overflow-hidden"
      variants={sceneTransitions.scaleFade}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      <div className="absolute inset-0 grid-bg opacity-30 crt-glow"></div>
      <div className="absolute inset-0 scanlines z-50"></div>

      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="font-display font-bold text-[4vw] tracking-wider mb-16 z-10"
      >
        TRACK REAL PROFIT OVER TIME
      </motion.div>

      {/* Line Chart */}
      <div className="relative w-[70vw] h-[30vh] border-l-2 border-b-2 border-text-muted/50 mb-16 z-10 flex items-end">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full overflow-visible">
          {/* Grid lines inside chart */}
          <line x1="0" y1="25" x2="100" y2="25" stroke="currentColor" strokeOpacity="0.1" strokeWidth="0.5" />
          <line x1="0" y1="50" x2="100" y2="50" stroke="currentColor" strokeOpacity="0.1" strokeWidth="0.5" />
          <line x1="0" y1="75" x2="100" y2="75" stroke="currentColor" strokeOpacity="0.1" strokeWidth="0.5" />
          
          <motion.polyline
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="2"
            points={points}
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ delay: 0.5, duration: 2, ease: "easeInOut" }}
            style={{ filter: "drop-shadow(0px 0px 10px rgba(0,255,65,0.8))" }}
          />
        </svg>
      </div>

      {/* Stats row */}
      <div className="flex gap-12 z-10">
        <StatBox label="WIN STRIKE RATE" value="18.4%" delay={1.5} />
        <StatBox label="PLACE STRIKE RATE" value="52.1%" delay={2.5} />
        <StatBox label="RETURN ON INVESTMENT" value="+24.5%" delay={3.5} highlight />
      </div>

    </motion.div>
  );
}

function StatBox({ label, value, delay, highlight = false }: { label: string, value: string, delay: number, highlight?: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8, filter: 'blur(10px)' }}
      animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
      transition={{ delay, duration: 0.6, type: 'spring', bounce: 0.4 }}
      className={`border ${highlight ? 'border-accent bg-accent/10' : 'border-text-muted/30 bg-bg-light/30'} p-6 flex flex-col items-center min-w-[20vw] backdrop-blur-sm`}
    >
      <div className="font-mono text-[1.2vw] text-text-muted mb-2">{label}</div>
      <div className={`font-display font-bold text-[4vw] ${highlight ? 'text-accent' : 'text-text-primary'}`}>
        {value}
      </div>
    </motion.div>
  );
}
