import React from 'react';
import { ThemeProvider } from './ThemeContext';
import Navbar from './Navbar';
import StaticAnalysisView from './StaticAnalysisView';

const StaticAnalysisPage: React.FC = () => {
    return (
        <ThemeProvider>
            <div className="min-h-screen bg-gray-50 dark:bg-[#0a0a0a] transition-colors duration-300">
                <Navbar />
                <main>
                    <StaticAnalysisView />
                </main>
            </div>
        </ThemeProvider>
    );
};

export default StaticAnalysisPage;
