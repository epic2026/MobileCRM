import { useState, useEffect } from 'react';
import { Phone, PhoneOff, Mic, MicOff, Volume2, Pause, Grid3X3, User } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Sheet,
  SheetContent,
} from '@/components/ui/sheet';

interface ActiveCallSheetProps {
  isOpen: boolean;
  onClose: () => void;
  phoneNumber: string;
  contactName?: string;
}

const ActiveCallSheet = ({ isOpen, onClose, phoneNumber, contactName }: ActiveCallSheetProps) => {
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaker, setIsSpeaker] = useState(false);
  const [isOnHold, setIsOnHold] = useState(false);
  const [isConnecting, setIsConnecting] = useState(true);

  useEffect(() => {
    if (isOpen) {
      setCallDuration(0);
      setIsConnecting(true);
      
      // Simulate connection
      const connectTimer = setTimeout(() => {
        setIsConnecting(false);
      }, 2000);

      return () => clearTimeout(connectTimer);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && !isConnecting) {
      const timer = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);

      return () => clearInterval(timer);
    }
  }, [isOpen, isConnecting]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const initials = contactName
    ? contactName.split(' ').map((n) => n[0]).join('').toUpperCase()
    : phoneNumber.slice(0, 2);

  const handleEndCall = () => {
    onClose();
  };

  const actionButtons = [
    { icon: isMuted ? MicOff : Mic, label: 'Mute', isActive: isMuted, onPress: () => setIsMuted(!isMuted) },
    { icon: Grid3X3, label: 'Keypad', isActive: false, onPress: () => {} },
    { icon: Volume2, label: 'Speaker', isActive: isSpeaker, onPress: () => setIsSpeaker(!isSpeaker) },
    { icon: Pause, label: 'Hold', isActive: isOnHold, onPress: () => setIsOnHold(!isOnHold) },
    { icon: User, label: 'Contacts', isActive: false, onPress: () => {} },
  ];

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent side="bottom" className="h-full bg-background border-none p-0">
        <div className="h-full flex flex-col items-center justify-between py-12 px-6">
          {/* Contact Info */}
          <div className="flex flex-col items-center">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="relative mb-6"
            >
              <Avatar className="w-28 h-28 bg-gradient-to-br from-primary to-accent">
                <AvatarFallback className="bg-transparent text-primary-foreground text-3xl font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              
              {/* Pulsing ring during connection */}
              <AnimatePresence>
                {isConnecting && (
                  <>
                    <motion.div
                      className="absolute inset-0 rounded-full border-2 border-primary"
                      animate={{ scale: [1, 1.5], opacity: [0.5, 0] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    />
                    <motion.div
                      className="absolute inset-0 rounded-full border-2 border-primary"
                      animate={{ scale: [1, 1.5], opacity: [0.5, 0] }}
                      transition={{ duration: 1.5, repeat: Infinity, delay: 0.5 }}
                    />
                  </>
                )}
              </AnimatePresence>
            </motion.div>

            <h2 className="text-2xl font-bold text-foreground mb-1">
              {contactName || phoneNumber}
            </h2>
            {contactName && (
              <p className="text-muted-foreground mb-2">{phoneNumber}</p>
            )}
            <p className={`text-lg ${isConnecting ? 'text-warning' : 'text-success'}`}>
              {isConnecting ? 'Calling...' : formatDuration(callDuration)}
            </p>
          </div>

          {/* Action Buttons */}
          <div className="w-full max-w-sm">
            <div className="grid grid-cols-3 gap-4 mb-8">
              {actionButtons.slice(0, 3).map((btn) => (
                <motion.button
                  key={btn.label}
                  whileTap={{ scale: 0.9 }}
                  onClick={btn.onPress}
                  className={`flex flex-col items-center gap-2 p-4 rounded-2xl transition-colors ${
                    btn.isActive ? 'bg-primary text-primary-foreground' : 'bg-secondary'
                  }`}
                >
                  <btn.icon className="w-6 h-6" />
                  <span className="text-xs">{btn.label}</span>
                </motion.button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-4 mb-12">
              {actionButtons.slice(3).map((btn) => (
                <motion.button
                  key={btn.label}
                  whileTap={{ scale: 0.9 }}
                  onClick={btn.onPress}
                  className={`flex flex-col items-center gap-2 p-4 rounded-2xl transition-colors ${
                    btn.isActive ? 'bg-primary text-primary-foreground' : 'bg-secondary'
                  }`}
                >
                  <btn.icon className="w-6 h-6" />
                  <span className="text-xs">{btn.label}</span>
                </motion.button>
              ))}
            </div>
          </div>

          {/* End Call Button */}
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={handleEndCall}
            className="w-16 h-16 rounded-full bg-destructive flex items-center justify-center"
          >
            <PhoneOff className="w-7 h-7 text-destructive-foreground" />
          </motion.button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default ActiveCallSheet;
