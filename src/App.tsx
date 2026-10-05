import React from 'react';
import { Header } from './components/Header';
import { SlideNavigator } from './components/SlideNavigator';
import { Canvas } from './components/Canvas';
import { OcrPanel } from './components/OcrPanel';
import { ReferenceDrawer } from './components/scaffolding/ReferenceDrawer';
import { useSessionStore } from './store/useSessionStore';
import { useHistoryKeyboard } from './core/hooks/useHistoryKeyboard';

export const App: React.FC = () => {
  useHistoryKeyboard();
  const { mode } = useSessionStore();

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col font-sans antialiased overflow-y-auto">
      <Header />
      <div className="flex-1 flex relative items-start w-full">
        {/* Only show SlideNavigator in Edit Mode. In Student Mode it is completely hidden */}
        {mode === 'edit' && <SlideNavigator />}
        <Canvas />
        <OcrPanel />
        <ReferenceDrawer />
      </div>
    </div>
  );
};

export default App;
