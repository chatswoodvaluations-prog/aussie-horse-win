import { motion } from 'framer-motion';
import { sceneTransitions } from '@/lib/video';

export function Scene2() {
  const filters = [
    { label: 'FIELD SIZE', condition: '8 TO 11', result: 'PASS' },
    { label: 'WIN ODDS', condition: '$5.00 – $10.00', result: 'PASS' },
    { label: 'PLACE ODDS', condition: '>= $1.85', result: 'PASS' },
    { label: 'SPEED MAP', condition: 'LEAD / ON-PACE / HANDY', result: 'PASS' },
    { label: 'BARRIER DRAW', condition: 'BARRIER 1 TO 5', result: 'PASS' },
  ];

  return (
    <motion.div
      className="absolute inset-0 bg-black text-white flex items-center justify-center overflow-hidden"
      variants={sceneTransitions.slideUp}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      <div className="absolute inset-0 grid-bg opacity-20 pointer-events-none" />
      <div className="absolute inset-0 scanlines z-50 pointer-events-none" />

      <div className="w-[84vw] border border-white/20 bg-[#0a0a0a] shadow-2xl shadow-[#00ff41]/10 p-[3vw] relative z-10 flex flex-col font-mono">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          className="text-[#00ff41] text-[1.8vw] mb-[2vw] font-bold border-b border-white/20 pb-[1.5vw] flex justify-between"
        >
          <span>SYSTEM // +EV SELECTION ENGINE</span>
          <span className="text-white/50">STATUS: ACTIVE</span>
        </motion.div>

        {/* Filter rows */}
        <div className="flex flex-col gap-[1.4vw] text-[2.2vw]">
          {filters.map((f, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0.15 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 + i * 0.9, duration: 0.3 }}
              className="flex items-center justify-between border-b border-white/10 pb-[1.2vw]"
            >
              <div className="flex gap-[2vw] items-center">
                <span className="text-white/30 text-[1.5vw] w-[2vw]">0{i + 1}</span>
                <span className="text-white font-bold tracking-wide">{f.label}</span>
              </div>

              <div className="flex items-center gap-[2.5vw]">
                <span className="text-white/50 text-[1.8vw]">{f.condition}</span>
                <motion.div
                  initial={{ opacity: 0, scale: 0.4 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 1.0 + i * 0.9, type: 'spring', stiffness: 500, damping: 22 }}
                  className="bg-[#00ff41] text-black px-[1.2vw] py-[0.3vw] font-black text-[1.8vw] min-w-[6vw] text-center"
                >
                  {f.result}
                </motion.div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Summary */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 6.0, duration: 0.4 }}
          className="mt-[2vw] text-center text-[2.8vw] font-display font-bold tracking-widest"
        >
          <span className="text-white/60 mr-4">142 RUNNERS SCANNED.</span>
          <span className="text-[#00ff41]">3 QUALIFY.</span>
        </motion.div>
      </div>
    </motion.div>
  );
}
