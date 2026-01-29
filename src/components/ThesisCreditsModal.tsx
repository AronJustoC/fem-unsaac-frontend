import React from 'react';
import Modal from './ui/Modal';
import { Award } from 'lucide-react';

interface ThesisCreditsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ThesisCreditsModal: React.FC<ThesisCreditsModalProps> = ({ isOpen, onClose }) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Acerca de la Tesis">
      <div className="flex flex-col items-center text-center space-y-6 py-2">
        <div className="w-16 h-16 bg-unsaac-red/10 rounded-full flex items-center justify-center text-unsaac-red mb-2">
          <Award size={32} />
        </div>
        
        <div className="space-y-2">
          <h4 className="text-[10px] uppercase tracking-[0.2em] font-bold text-unsaac-red dark:text-unsaac-gold">Título de la Tesis</h4>
          <p className="font-display text-lg leading-snug text-text-light dark:text-text-dark italic px-2">
            "Implementación de un software de análisis estructural por elementos finitos para la Escuela Profesional de Ingeniería Mecánica"
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 w-full pt-4 border-t border-border-light dark:border-border-dark">
          <div className="space-y-1">
            <h5 className="text-[10px] uppercase tracking-[0.1em] font-bold text-gray-400">Tesista</h5>
            <p className="font-display text-base text-text-light dark:text-text-dark">Aron Choque</p>
          </div>
          
          <div className="space-y-1">
            <h5 className="text-[10px] uppercase tracking-[0.1em] font-bold text-gray-400">Asesor</h5>
            <p className="font-display text-base text-text-light dark:text-text-dark">[Nombre del Asesor]</p>
          </div>
        </div>

        <div className="space-y-3 pt-4 w-full border-t border-border-light dark:border-border-dark">
          <div className="space-y-0.5">
            <p className="text-[11px] font-bold text-text-light/60 dark:text-text-dark/60 uppercase">Universidad Nacional de San Antonio Abad del Cusco</p>
            <p className="text-[10px] text-text-light/40 dark:text-text-dark/40">Facultad de Ingeniería Eléctrica, Electrónica, Informática y Mecánica</p>
            <p className="text-[10px] text-text-light/40 dark:text-text-dark/40 italic">Escuela Profesional de Ingeniería Mecánica</p>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default ThesisCreditsModal;
