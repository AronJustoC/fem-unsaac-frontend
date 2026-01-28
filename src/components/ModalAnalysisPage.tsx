import React from 'react';
import { ThemeProvider } from './ThemeContext';
import Navbar from './Navbar';
import ModalAnalysisView from './ModalAnalysisView';

const ModalAnalysisPage: React.FC = () => {
    return (
        <ThemeProvider>
            <div className="min-h-screen bg-gray-50 dark:bg-[#0a0a0a] transition-colors duration-300">
                <Navbar />
                <main>
                    <ModalAnalysisView />
                </main>
            </div>
        </ThemeProvider>
    );
};

export default ModalAnalysisPage;
