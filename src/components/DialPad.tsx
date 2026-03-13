import { useState } from 'react';
import { Phone, Delete, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface DialPadProps {
  onCall: (number: string) => void;
}

const dialButtons = [
  { digit: '1', letters: '' },
  { digit: '2', letters: 'ABC' },
  { digit: '3', letters: 'DEF' },
  { digit: '4', letters: 'GHI' },
  { digit: '5', letters: 'JKL' },
  { digit: '6', letters: 'MNO' },
  { digit: '7', letters: 'PQRS' },
  { digit: '8', letters: 'TUV' },
  { digit: '9', letters: 'WXYZ' },
  { digit: '*', letters: '' },
  { digit: '0', letters: '+' },
  { digit: '#', letters: '' },
];

const DialPad = ({ onCall }: DialPadProps) => {
  const [number, setNumber] = useState('');

  const handleDigit = (digit: string) => {
    if (number.length < 15) {
      setNumber((prev) => prev + digit);
    }
  };

  const handleDelete = () => {
    setNumber((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    setNumber('');
  };

  const handleCall = () => {
    if (number.length > 0) {
      onCall(number);
    }
  };

  return (
    <div className="pb-20 flex flex-col items-center justify-center min-h-[calc(100vh-80px)]">
      {/* Number Display */}
      <div className="w-full px-6 mb-8">
        <div className="h-20 flex items-center justify-center">
          <AnimatePresence mode="popLayout">
            {number ? (
              <motion.p
                key={number}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-3xl font-light text-foreground tracking-wider"
              >
                {number}
              </motion.p>
            ) : (
              <p className="text-xl text-muted-foreground">Enter number</p>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Dial Pad */}
      <div className="grid grid-cols-3 gap-4 px-8 mb-8">
        {dialButtons.map((btn) => (
          <motion.button
            key={btn.digit}
            whileTap={{ scale: 0.9 }}
            onClick={() => handleDigit(btn.digit)}
            className="dial-button flex flex-col items-center justify-center"
          >
            <span className="text-xl font-medium">{btn.digit}</span>
            {btn.letters && (
              <span className="text-[10px] text-muted-foreground tracking-widest">{btn.letters}</span>
            )}
          </motion.button>
        ))}
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-8">
        {/* Clear Button */}
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={handleClear}
          className={`w-14 h-14 rounded-full flex items-center justify-center transition-opacity ${
            number ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          <X className="w-6 h-6 text-muted-foreground" />
        </motion.button>

        {/* Call Button */}
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={handleCall}
          disabled={!number}
          className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${
            number
              ? 'bg-success glow-primary'
              : 'bg-success/30'
          }`}
        >
          <Phone className="w-7 h-7 text-success-foreground" />
          {number && (
            <motion.span
              className="absolute w-full h-full rounded-full bg-success/50"
              animate={{ scale: [1, 1.2], opacity: [0.5, 0] }}
              transition={{ duration: 1, repeat: Infinity }}
            />
          )}
        </motion.button>

        {/* Delete Button */}
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={handleDelete}
          className={`w-14 h-14 rounded-full flex items-center justify-center transition-opacity ${
            number ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          <Delete className="w-6 h-6 text-muted-foreground" />
        </motion.button>
      </div>
    </div>
  );
};

export default DialPad;
