import React from "react";
import { ThemeProvider } from "./ThemeContext";
import Navbar from "./Navbar";
import HarmonicAnalysisView from "./HarmonicAnalysisView";

const HarmonicAnalysisPage: React.FC = () => {
  return (
    <ThemeProvider>
      <div className="h-screen flex flex-col overflow-hidden bg-gray-50 dark:bg-[#0a0a0a] transition-colors duration-300">
        <Navbar />
        <main className="flex-1 overflow-hidden relative">
          <HarmonicAnalysisView />
        </main>
      </div>
    </ThemeProvider>
  );
};

export default HarmonicAnalysisPage;
