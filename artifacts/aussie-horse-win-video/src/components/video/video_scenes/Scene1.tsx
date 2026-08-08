import { motion } from 'framer-motion';
import { sceneTransitions } from '@/lib/video';

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
      className="absolute inset-0 bg-black text-[#00ff41] font-mono flex flex-col p-12 overflow-hidden"
      variants={sceneTransitions.fadeBlur}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      <div className="absolute inset-0 scanlines z-50 pointer-events-none" />
      <div className="absolute inset-0 crt-glow z-40 pointer-events-none" />

      {/* Boot sequence */}
      <div className="relative z-10 flex flex-col gap-5 text-[2.4vw] leading-snug">
        <motion.div
          initial={{ clipPath: 'inset(0 100% 0 0)' }}
          animate={{ clipPath: 'inset(0 0% 0 0)' }}
          transition={{ duration: 0.8, ease: 'linear' }}
          className="text-[#00ff41]"
        >
          {'> ./aussie_horse_win.sh --scan-provincial'}
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="text-[#00ff41]"
        >
          [OK] Connected to TAB &amp; Betfair feeds
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5 }}
          className="text-[#00ff41]"
        >
          [OK] 12 VIC &amp; NSW tracks loaded
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2.0 }}
          className="text-[#ff4444]"
        >
          [WARN] High field count detected — applying strict filters
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2.6 }}
          className="text-[#00ff41]"
        >
          [INFO] Commencing +EV evaluation loop...
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0] }}
          transition={{ delay: 3.0, duration: 0.6, repeat: Infinity }}
          className="w-[2vw] h-[2.8vw] bg-[#00ff41] mt-1"
        />
      </div>

      {/* Scrolling runner matrix */}
      <motion.div
        initial={{ opacity: 0, y: '50vh' }}
        animate={{ opacity: 0.7, y: '-250vh' }}
        transition={{
          opacity: { delay: 3, duration: 0.2 },
          y: { delay: 3, duration: 4, ease: 'linear' },
        }}
        className="absolute inset-0 top-[40vh] left-12 right-12 z-20 flex flex-col gap-2 text-[1.7vw] text-[#00ff41]/60"
      >
        {RUNNERS.map((r, i) => (
          <div key={i}>{r}</div>
        ))}
      </motion.div>

      {/* Hero overlay */}
      <motion.div
        initial={{ opacity: 0, scale: 1.4 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 4.5, duration: 0.5, ease: 'easeOut' }}
        className="absolute inset-0 z-30 flex items-center justify-center font-display text-[6.5vw] font-bold text-[#00ff41] tracking-tighter"
      >
        <span className="bg-black px-8 py-3 border-l-[10px] border-[#00ff41]">
          ANALYZING 1000+ RUNNERS
        </span>
      </motion.div>
    </motion.div>
  );
}
