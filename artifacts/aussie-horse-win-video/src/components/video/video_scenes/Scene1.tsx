import { motion } from 'framer-motion';
import { sceneTransitions } from '@/lib/video';

// Fake data for the scrolling matrix
const generateRunners = () => {
  const tracks = ['BEN', 'GEE', 'WAN', 'MIL', 'BAL', 'CRA', 'WAG', 'DUB', 'SCO', 'ALB', 'TAM', 'HAW'];
  const data = [];
  for (let i = 0; i < 60; i++) {
    const track = tracks[Math.floor(Math.random() * tracks.length)];
    const race = Math.floor(Math.random() * 8) + 1;
    const number = Math.floor(Math.random() * 14) + 1;
    const odds = (Math.random() * 15 + 1.5).toFixed(2);
    const pos = ['L', 'OP', 'H', 'M', 'B'][Math.floor(Math.random() * 5)];
    data.push(`${track} R${race} #${number}  [ODDS: $${odds}]  [MAP: ${pos}]  -- EVALUATING...`);
  }
  return data;
};

const RUNNERS = generateRunners();

export function Scene1() {
  return (
    <motion.div
      className="absolute inset-0 bg-bg-dark text-text-secondary font-mono flex flex-col p-12 overflow-hidden"
      variants={sceneTransitions.fadeBlur}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      <div className="absolute inset-0 scanlines z-50"></div>
      <div className="absolute inset-0 crt-glow z-40"></div>

      {/* Boot sequence */}
      <div className="relative z-10 flex flex-col gap-4 text-[2vw] leading-tight">
        <motion.div
          initial={{ clipPath: 'inset(0 100% 0 0)' }}
          animate={{ clipPath: 'inset(0 0% 0 0)' }}
          transition={{ duration: 0.8, ease: 'linear' }}
        >
          {'> ./aussie_horse_win.sh --scan-provincial'}
        </motion.div>
        
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="text-text-muted"
        >
          [OK] Connected to TAB & Betfair APIs
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5 }}
          className="text-text-muted"
        >
          [INFO] Loading 12 VIC & NSW tracks...
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2.2 }}
          className="text-text-muted"
        >
          [INFO] Commencing +EV evaluation loop...
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2.7, repeat: Infinity, duration: 0.5, repeatType: 'reverse' }}
          className="w-[2vw] h-[2.5vw] bg-accent mt-2"
        />
      </div>

      {/* Fast scrolling matrix of runners that starts at 3.0s */}
      <motion.div
        initial={{ opacity: 0, y: '50vh' }}
        animate={{ opacity: 0.8, y: '-250vh' }}
        transition={{ 
          opacity: { delay: 3, duration: 0.2 },
          y: { delay: 3, duration: 4, ease: 'linear' } 
        }}
        className="absolute inset-0 top-[40vh] left-12 right-12 z-20 flex flex-col gap-2 text-[1.5vw] text-text-muted opacity-50"
      >
        {RUNNERS.map((r, i) => (
          <div key={i}>{r}</div>
        ))}
      </motion.div>

      {/* Dramatic text overlay near the end */}
      <motion.div
        initial={{ opacity: 0, scale: 1.5 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 4.5, duration: 0.5, ease: 'easeOut' }}
        className="absolute inset-0 z-30 flex items-center justify-center font-display text-[6vw] font-bold text-text-primary tracking-tighter"
      >
        <span className="bg-bg-dark px-6 py-2 border-l-8 border-accent">
          ANALYZING 1000+ RUNNERS
        </span>
      </motion.div>
    </motion.div>
  );
}
