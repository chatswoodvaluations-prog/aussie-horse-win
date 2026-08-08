import { motion } from 'framer-motion';
import { sceneTransitions } from '@/lib/video';

export function Scene5() {
  return (
    <motion.div
      className="absolute inset-0 bg-black text-white flex flex-col items-center justify-center overflow-hidden"
      variants={sceneTransitions.perspectiveFlip}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      <div className="absolute inset-0 grid-bg opacity-20 pointer-events-none" />
      <div className="absolute inset-0 scanlines z-50 pointer-events-none" />

      <div className="relative z-10 flex flex-col items-center">

        {/* Logo mark */}
        <motion.div
          initial={{ scale: 0, rotate: -90 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ duration: 1.2, type: 'spring', damping: 20 }}
          className="w-[12vw] h-[12vw] border border-[#00ff41] mb-[2vw] relative flex items-center justify-center"
          style={{ background: 'rgba(0,255,65,0.04)' }}
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.5, duration: 1 }}
            className="absolute inset-[10%] border border-[#00ff41]/40 rounded-full"
          />
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.7, duration: 1 }}
            className="absolute inset-[30%] border border-[#00ff41]/25 rounded-full"
          />

          <motion.div
            initial={{ height: 0 }}
            animate={{ height: '70%' }}
            transition={{ delay: 1.0, duration: 0.8, ease: 'easeOut' }}
            className="absolute bottom-[15%] left-[25%] bg-[#00ff41]"
            style={{ width: '0.5vw' }}
          />
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: '40%' }}
            transition={{ delay: 1.1, duration: 0.8, ease: 'easeOut' }}
            className="absolute bottom-[15%] left-[48%] bg-[#ff8c00]"
            style={{ width: '0.5vw' }}
          />
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: '90%' }}
            transition={{ delay: 1.2, duration: 0.8, ease: 'easeOut' }}
            className="absolute bottom-[15%] right-[25%] bg-[#00ff41]"
            style={{ width: '0.5vw' }}
          />
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.5, duration: 0.8 }}
          className="font-display font-black text-[8.5vw] tracking-tighter leading-none mb-[1vw] text-white"
        >
          AUSSIE HORSE WIN
        </motion.h1>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2.2, duration: 0.8 }}
          className="font-mono text-white/50 text-[2.2vw] tracking-[0.3em] flex items-center gap-[1vw]"
        >
          DATA-DRIVEN PROVINCIAL RACING
          <motion.div
            animate={{ opacity: [1, 0, 1] }}
            transition={{ delay: 2.5, repeat: Infinity, duration: 0.6 }}
            className="bg-[#00ff41]"
            style={{ width: '1.5vw', height: '2.2vw' }}
          />
        </motion.div>

        {/* Colour key strip */}
        <motion.div
          initial={{ opacity: 0, scaleX: 0 }}
          animate={{ opacity: 1, scaleX: 1 }}
          transition={{ delay: 3.0, duration: 0.7, ease: 'easeOut' }}
          className="mt-[2.5vw] flex items-center gap-[2vw] font-mono text-[1.5vw]"
          style={{ transformOrigin: 'left' }}
        >
          <span className="flex items-center gap-[0.6vw]">
            <span className="inline-block w-[2vw] h-[0.4vw] bg-[#00ff41]" />
            <span className="text-[#00ff41]">SELECTION QUALIFIES</span>
          </span>
          <span className="text-white/20">|</span>
          <span className="flex items-center gap-[0.6vw]">
            <span className="inline-block w-[2vw] h-[0.4vw] bg-[#ff4444]" />
            <span className="text-[#ff4444]">FILTER FAILED</span>
          </span>
          <span className="text-white/20">|</span>
          <span className="flex items-center gap-[0.6vw]">
            <span className="inline-block w-[2vw] h-[0.4vw] bg-[#ff8c00]" />
            <span className="text-[#ff8c00]">STAKING</span>
          </span>
        </motion.div>
      </div>
    </motion.div>
  );
}
