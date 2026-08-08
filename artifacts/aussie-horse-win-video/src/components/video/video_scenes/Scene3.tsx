import { motion } from 'framer-motion';
import { sceneTransitions } from '@/lib/video';

export function Scene3() {
  return (
    <motion.div
      className="absolute inset-0 bg-bg-dark text-text-primary flex items-center justify-center overflow-hidden"
      variants={sceneTransitions.wipe}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      <div className="absolute inset-0 grid-bg opacity-30 crt-glow"></div>
      <div className="absolute inset-0 scanlines z-50"></div>

      <div className="flex flex-col items-center z-10 w-full max-w-[80vw]">
        
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="font-mono text-accent text-[2vw] mb-4 tracking-widest"
        >
          [ MATCH FOUND ]
        </motion.div>

        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.4, type: 'spring', stiffness: 300, damping: 20 }}
          className="font-display text-[5vw] font-bold text-center border-y-4 border-text-muted/30 py-6 w-full mb-16"
        >
          BENDIGO R4 <span className="text-text-muted">/</span> #3 QUANTUM LEAP
        </motion.div>

        <div className="flex gap-8 w-full">
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 1.5, duration: 0.6 }}
            className="flex-1 border border-text-muted/30 p-8 flex flex-col items-center bg-bg-light/50"
          >
            <div className="font-mono text-text-muted text-[1.8vw] mb-4">RECOMMENDED WIN STAKE</div>
            <div className="font-display font-bold text-[6vw] text-accent">$5</div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 2.0, duration: 0.6 }}
            className="flex-1 border border-text-muted/30 p-8 flex flex-col items-center bg-bg-light/50"
          >
            <div className="font-mono text-text-muted text-[1.8vw] mb-4">RECOMMENDED PLACE STAKE</div>
            <div className="font-display font-bold text-[6vw] text-accent">$20</div>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 3.5, duration: 0.5 }}
          className="mt-12 flex items-center justify-between w-full px-8 py-4 bg-accent text-bg-dark font-mono font-bold text-[2vw]"
        >
          <span>TOTAL OUTLAY: $25</span>
          <span>MAXIMIZING UPSIDE. PROTECTING DOWNSIDE.</span>
        </motion.div>

      </div>
    </motion.div>
  );
}
