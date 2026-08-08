import { motion } from 'framer-motion';
import { sceneTransitions } from '@/lib/video';

export function Scene3() {
  return (
    <motion.div
      className="absolute inset-0 bg-black text-white flex items-center justify-center overflow-hidden"
      variants={sceneTransitions.wipe}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      <div className="absolute inset-0 grid-bg opacity-20 pointer-events-none" />
      <div className="absolute inset-0 scanlines z-50 pointer-events-none" />

      <div className="flex flex-col items-center z-10 w-full max-w-[84vw]">

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="font-mono text-[#00ff41] text-[2.2vw] mb-[1.5vw] tracking-widest"
        >
          [ SELECTION LOCKED ]
        </motion.div>

        <motion.div
          initial={{ scale: 0.92, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.4, type: 'spring', stiffness: 300, damping: 22 }}
          className="font-display text-[5.5vw] font-bold text-center border-y-4 border-white/20 py-[1.5vw] w-full mb-[3vw]"
        >
          BENDIGO R4 <span className="text-white/40">/</span> #3 QUANTUM LEAP
        </motion.div>

        {/* Info cards — orange on black */}
        <div className="flex gap-[2vw] w-full">
          <motion.div
            initial={{ opacity: 0, x: -60 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 1.4, duration: 0.6 }}
            className="flex-1 border-2 border-[#ff8c00]/40 p-[2.5vw] flex flex-col items-center bg-black"
          >
            <div className="font-mono text-[#ff8c00] text-[1.9vw] mb-[1vw] tracking-widest text-center">
              WIN STAKE
            </div>
            <div className="font-display font-black text-[7vw] text-[#ff8c00] leading-none">
              $5
            </div>
            <div className="font-mono text-[#ff8c00]/50 text-[1.4vw] mt-[0.8vw]">
              WIN BET
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 60 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 1.9, duration: 0.6 }}
            className="flex-1 border-2 border-[#ff8c00]/40 p-[2.5vw] flex flex-col items-center bg-black"
          >
            <div className="font-mono text-[#ff8c00] text-[1.9vw] mb-[1vw] tracking-widest text-center">
              PLACE STAKE
            </div>
            <div className="font-display font-black text-[7vw] text-[#ff8c00] leading-none">
              $20
            </div>
            <div className="font-mono text-[#ff8c00]/50 text-[1.4vw] mt-[0.8vw]">
              PLACE BET
            </div>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 3.2, duration: 0.5 }}
          className="mt-[2vw] flex items-center justify-between w-full px-[2vw] py-[1.2vw] bg-[#00ff41] text-black font-mono font-black text-[2.2vw]"
        >
          <span>TOTAL OUTLAY: $25</span>
          <span>MAXIMISING UPSIDE. PROTECTING DOWNSIDE.</span>
        </motion.div>
      </div>
    </motion.div>
  );
}
