import { motion } from 'framer-motion';
import { sceneTransitions } from '@/lib/video';

export function Scene5() {
  return (
    <motion.div
      className="absolute inset-0 bg-bg-dark text-text-primary flex flex-col items-center justify-center overflow-hidden"
      variants={sceneTransitions.perspectiveFlip}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      <div className="absolute inset-0 grid-bg opacity-30 crt-glow"></div>
      <div className="absolute inset-0 scanlines z-50"></div>

      <div className="relative z-10 flex flex-col items-center">
        
        {/* Abstract logo/mark representing data + racing tracks */}
        <motion.div
          initial={{ scale: 0, rotate: -90 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ duration: 1.2, type: 'spring', damping: 20 }}
          className="w-[12vw] h-[12vw] border border-accent mb-8 relative flex items-center justify-center bg-accent/5 backdrop-blur-md"
        >
          {/* Inner rings */}
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.5, duration: 1 }}
            className="absolute inset-[10%] border border-accent/50 rounded-full"
          />
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.7, duration: 1 }}
            className="absolute inset-[30%] border border-accent/30 rounded-full"
          />
          
          {/* Data bars */}
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: '70%' }}
            transition={{ delay: 1.0, duration: 0.8, ease: 'easeOut' }}
            className="w-[0.5vw] bg-accent absolute bottom-[15%] left-[25%]"
          />
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: '40%' }}
            transition={{ delay: 1.1, duration: 0.8, ease: 'easeOut' }}
            className="w-[0.5vw] bg-accent absolute bottom-[15%] left-[48%]"
          />
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: '90%' }}
            transition={{ delay: 1.2, duration: 0.8, ease: 'easeOut' }}
            className="w-[0.5vw] bg-accent absolute bottom-[15%] right-[25%]"
          />
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.5, duration: 0.8 }}
          className="font-display font-bold text-[8vw] tracking-tighter leading-none mb-4"
        >
          AUSSIE HORSE WIN
        </motion.h1>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2.2, duration: 0.8 }}
          className="font-mono text-text-muted text-[2vw] tracking-widest flex items-center gap-4"
        >
          DATA-DRIVEN PROVINCIAL RACING
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 2.5, repeat: Infinity, duration: 0.5, repeatType: 'reverse' }}
            className="w-[1.5vw] h-[2vw] bg-accent"
          />
        </motion.div>
        
      </div>
    </motion.div>
  );
}
