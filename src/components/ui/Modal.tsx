import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children }) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 isolate z-[99999] flex items-center justify-center">
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-md transition-opacity animate-in fade-in duration-300" 
        onClick={onClose}
      />
      
      <div 
        className="relative bg-white dark:bg-bg-dark-panel w-full max-w-md mx-4 rounded-[2.5rem] shadow-2xl border border-border-light dark:border-border-dark flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-300 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-border-light dark:border-border-dark bg-gray-50/50 dark:bg-black/20">
          <h3 className="text-sm font-display font-black text-gray-900 dark:text-white uppercase tracking-[0.2em]">
            {title}
          </h3>
          <button 
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-unsaac-red hover:bg-unsaac-red/5 rounded-xl transition-all active:scale-95 cursor-pointer"
            aria-label="Cerrar"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-8 overflow-y-auto custom-scrollbar">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default Modal;
