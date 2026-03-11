/// <reference types="chrome" />
import { useCallback, useState, useEffect } from 'react';
import type { ScriptListItem } from './types';
import { ScriptList, ScriptDetail as ScriptDetailComponent, ScriptExecution } from './components';
import './scripts.less';

type ViewMode = 'list' | 'detail' | 'execution';

export default function Scripts() {
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedScript, setSelectedScript] = useState<ScriptListItem | null>(null);
  const [executionScriptId, setExecutionScriptId] = useState<number | null>(null);
  const [savedFilters, setSavedFilters] = useState<{ caseTitle: string; createUser: string } | null>(null);

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      const executionMatch = hash.match(/#\/execution\/(\d+)/);
      
      if (executionMatch) {
        const scriptId = parseInt(executionMatch[1]);
        setExecutionScriptId(scriptId);
        setViewMode('execution');
      } else {
        setViewMode('list');
        setExecutionScriptId(null);
      }
    };

    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, []);

  const handleSelectScript = useCallback((script: ScriptListItem) => {
    console.log('[Scripts] Selected script:', script);
    setSelectedScript(script);
    setViewMode('detail');
    window.location.hash = '';
  }, []);

  const handleBackToList = useCallback(() => {
    setViewMode('list');
    setSelectedScript(null);
    window.location.hash = '';
  }, []);

  const handleBackFromExecution = useCallback(() => {
    setViewMode('list');
    setExecutionScriptId(null);
    window.location.hash = '';
  }, []);

  const handleFiltersChange = useCallback((filters: { caseTitle: string; createUser: string }) => {
    setSavedFilters(filters);
  }, []);

  return (
    <div className="scripts-container">
      {viewMode === 'list' && (
        <ScriptList 
          onSelectScript={handleSelectScript}
          savedFilters={savedFilters}
          onFiltersChange={handleFiltersChange}
        />
      )}
      {viewMode === 'detail' && selectedScript && (
        <ScriptDetailComponent
          scriptId={selectedScript.id}
          scriptTitle={selectedScript.caseTitle}
          onBack={handleBackToList}
        />
      )}
      {viewMode === 'execution' && executionScriptId && (
        <ScriptExecution
          scriptId={executionScriptId}
          scriptTitle={`用例 ${executionScriptId}`}
          onBack={handleBackFromExecution}
        />
      )}
    </div>
  );
}
