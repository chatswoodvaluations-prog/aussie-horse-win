import { motion } from 'framer-motion';
import { sceneTransitions } from '@/lib/video';

export function Scene2() {
  const filters = [
    { label: 'FIELD SIZE', condition: '8 TO 11', result: 'PASS' },
    { label: 'WIN ODDS', condition: '$5.00 - $10.00', result: 'PASS' },
    { label: 'MIN PLACE ODDS', condition: '>= $1.85', result: 'PASS' },
    { label: 'SPEED MAP', condition: 'LEAD/ON-PACE/HANDY', result: 'PASS' },
    { label: 'BARRIER DRAW', condition: '1 TO 5', result: 'PASS' },
  ];

  return (
    <motion.div
      className="absolute inset-0 bg-bg-dark text-text-primary flex items-center justify-center overflow-hidden"
      variants={sceneTransitions.slideUp}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      <div className="absolute inset-0 grid-bg opacity-30"></div>
      <div className="absolute inset-0 scanlines z-50"></div>
      
      <div className="w-[80vw] border border-text-muted/30 bg-bg-light/80 backdrop-blur-sm shadow-2xl shadow-accent/5 p-8 relative z-10 flex flex-col font-mono">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          className="text-accent text-[1.5vw] mb-8 font-bold border-b border-text-muted/30 pb-4 flex justify-between"
        >
          <span>SYSTEM // +EV SELECTION ENGINE</span>
          <span>STATUS: ACTIVE</span>
        </motion.div>

        <div className="flex flex-col gap-6 text-[2vw]">
          {filters.map((f, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0.2, color: 'var(--color-text-muted)' }}
              animate={{ opacity: 1, color: 'var(--color-text-primary)' }}
              transition={{ delay: 0.8 + i * 0.8, duration: 0.2 }}
              className="flex items-center justify-between border-b border-text-muted/10 pb-4"
            >
              <div className="flex gap-8">
                <span className="w-[4vw] text-text-muted opacity-50">0{i + 1}</span>
                <span>{f.label}</span>
              </div>
              
              <div className="flex items-center gap-12 text-[1.8vw]">
                <span className="text-text-muted">[{f.condition}]</span>
                <motion.div
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 1.2 + i * 0.8, type: 'spring', stiffness: 400, damping: 20 }}
                  className="bg-accent text-bg-dark px-4 py-1 font-bold"
                >
                  {f.result}
                </motion.div>
              </div>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 5.5, duration: 0.3 }}
          className="mt-12 text-center text-[2.5vw] font-display font-bold tracking-widest"
        >
          <span className="text-text-muted mr-4">142 RUNNERS SCANNED.</span>
          <span className="text-accent">3 QUALIFY.</span>
        </motion.div>
      </div>
    </motion.div>
  );
}
