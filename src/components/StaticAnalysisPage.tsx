import React from 'react';
import { ThemeProvider } from './ThemeContext';
import Navbar from './Navbar';
import StaticAnalysisView from './StaticAnalysisView';

const StaticAnalysisPage: React.FC = () => {
    return (
        <ThemeProvider>
            <div className="h-screen flex flex-col overflow-hidden bg-gray-50 dark:bg-[#0a0a0a] transition-colors duration-300">
                <Navbar />
                <main className="flex-1 overflow-hidden relative">
                    <StaticAnalysisView />
                </main>
            </div>
        </ThemeProvider>
    );
};

export default StaticAnalysisPage;
