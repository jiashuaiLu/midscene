import {
  CheckCircleOutlined,
  CheckOutlined,
  CodeOutlined,
  CopyOutlined,
  DownOutlined,
  DownloadOutlined,
  FileTextOutlined,
  LoadingOutlined,
  PushpinFilled,
  PushpinOutlined,
  ReloadOutlined,
  CloudUploadOutlined,
} from '@ant-design/icons';
import type { CodeGenerationChunk, StreamingCallback } from '@midscene/core';
import type { ChromeRecordedEvent } from '@midscene/recorder';
import { globalModelConfigManager } from '@midscene/shared/env';
import { Button, Modal, Select, Tooltip, Typography, message } from 'antd';
import type React from 'react';
import { useEffect, useState } from 'react';
import { useRecordingSessionStore } from '../../../store';
import { generateAIDescription } from '../../../utils/eventOptimizer';
import {
  generatePlaywrightTestStream,
  generateTextCaseStream,
  generateYamlTestStream,
  parseTextCaseFromJson,
} from '../generators';
import type { TextCase } from '../generators/textCaseGenerator';
import { recordLogger } from '../logger';
import {
  getLatestEvents,
  resolveSessionName,
  stopRecordingIfActive,
} from '../shared/exportControlsUtils';
import { generateRecordTitle } from '../utils';
import { CodeBlock } from './ProgressModal/CodeBlock';
import { StepList } from './ProgressModal/StepList';
import { TextCaseView } from './TextCaseView';

export interface ProgressStep {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'loading' | 'completed' | 'error';
  progress?: number;
  details?: string;
}

export type CodeGenerationType = 'yaml' | 'playwright' | 'textCase' | 'none';

interface ProgressModalProps {
  eventsCount?: number;
  sessionName?: string;
  events?: ChromeRecordedEvent[];
  sessionId?: string;
  onStopRecording?: () => void | Promise<void>;
  isFromStopRecording?: boolean;
}

export const ProgressModal: React.FC<ProgressModalProps> = ({
  eventsCount = 0,
  sessionName = '',
  events = [],
  sessionId,
  onStopRecording,
  isFromStopRecording,
}) => {
  const [selectedType, setSelectedType] = useState<CodeGenerationType>('textCase');

  // Initialize defaultType from localStorage
  const [defaultType, setDefaultType] = useState<CodeGenerationType>(() => {
    try {
      const stored = localStorage.getItem('midscene-default-code-type');
      if (stored && ['yaml', 'playwright', 'none', 'textCase'].includes(stored)) {
        return stored as CodeGenerationType;
      }
    } catch (error) {
      console.warn(
        'Failed to read default code type from localStorage:',
        error,
      );
    }
    return 'textCase'; // fallback default
  });
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());
  const [slidingOutSteps, setSlidingOutSteps] = useState<Set<string>>(
    new Set(),
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedTest, setGeneratedTest] = useState('');
  const [generatedYaml, setGeneratedYaml] = useState('');
  const [generatedTextCase, setGeneratedTextCase] = useState<TextCase | null>(null);
  const [generatedTextCaseJson, setGeneratedTextCaseJson] = useState('');
  const [steps, setSteps] = useState<ProgressStep[]>([]);
  const [showGeneratedCode, setShowGeneratedCode] = useState(false);

  // Streaming states
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [thinkingProcess, setThinkingProcess] = useState('');
  const [actualCode, setActualCode] = useState('');
  const [accumulatedThinking, setAccumulatedThinking] = useState('');

  // TextCase sync states
  const [isSyncing, setIsSyncing] = useState(false);
  const [generatedJsScript, setGeneratedJsScript] = useState('');
  const [syncedCaseId, setSyncedCaseId] = useState<number | null>(null);

  const { updateSession } = useRecordingSessionStore();

  const handleSyncToDonggui = async (): Promise<{ success: boolean; caseId?: number; cancelled?: boolean }> => {
    if (!generatedTextCase || !generatedTextCaseJson) {
      message.warning('没有可同步的测试用例');
      return { success: false };
    }

    return new Promise((resolve) => {
      Modal.confirm({
        title: null,
        icon: null,
        content: (
          <div className="sync-form">
            <div className="sync-form-item">
              <label>ERP：</label>
              <input 
                id="sync-operator" 
                type="text" 
                placeholder="请输入erp"
                defaultValue=""
                style={{ width: '100%', padding: '4px 8px', border: '1px solid #d9d9d9', borderRadius: '4px' }}
              />
            </div>
            <div className="sync-form-item" style={{ marginTop: '12px' }}>
              <label>应用：</label>
              <select 
                id="sync-app-name"
                defaultValue="京东"
                style={{ width: '100%', padding: '4px 8px', border: '1px solid #d9d9d9', borderRadius: '4px' }}
              >
                <option value="">请选择应用</option>
                <option value="京东">京东商城</option>
                <option value="京麦">京麦</option>
                <option value="赔付系统">赔付系统</option>
                <option value="采销">采销</option>
                <option value="招商门户">招商门户</option>
                <option value="UAD工作台">UAD工作台</option>
                <option value="Joybuy">Joybuy</option>
              </select>
            </div>
          </div>
        ),
        okText: '同步',
        cancelText: '取消',
        onOk: async () => {
          const operatorInput = document.getElementById('sync-operator') as HTMLInputElement;
          const appNameSelect = document.getElementById('sync-app-name') as HTMLSelectElement;
          
          const operator = operatorInput?.value || '';
          const appName = appNameSelect?.value || '京东';

          if (!operator) {
            message.error('请输入操作人');
            return Promise.reject();
          }

          setIsSyncing(true);
          try {
            const response = await fetch('https://joy-ai-test.jd.com/case/add', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                caseTitle: generatedTextCase.caseTitle,
                caseDetail: generatedTextCaseJson,
                autoCaseDetail: generatedJsScript,
                appName: appName,
                priority: parseInt(generatedTextCase.casePriority) || 2,
                platform: generatedTextCase.platform || 1,
                caseType: 1,
                yamlScript: '',
                operator: operator,
                isJoyTest: true,
              }),
            });

            if (response.ok) {
              const result = await response.json();
              if (result.code === 200) {
                const caseId = result.data?.id || result.data?.caseId;
                if (caseId) {
                  setSyncedCaseId(caseId);
                }
                resolve({ success: true, caseId });
              } else {
                message.error(`同步失败: ${result.message || '未知错误'}`);
                resolve({ success: false });
              }
            } else {
              message.error(`同步失败: HTTP ${response.status}`);
              resolve({ success: false });
            }
          } catch (error) {
            console.error('Sync error:', error);
            message.error(`同步失败: ${error instanceof Error ? error.message : '网络错误'}`);
            resolve({ success: false });
          } finally {
            setIsSyncing(false);
          }
        },
        onCancel: () => {
          resolve({ success: false, cancelled: true });
        },
      });
    });
  };

  const handleNavigateToDetail = (caseId: number) => {
    const url = chrome.runtime.getURL(`index.html#/scripts/${caseId}`);
    chrome.tabs.create({ url });
  };
  // Function to update defaultType and persist to localStorage
  const updateDefaultType = (newType: CodeGenerationType) => {
    setDefaultType(newType);
    try {
      localStorage.setItem('midscene-default-code-type', newType);
    } catch (error) {
      console.warn('Failed to save default code type to localStorage:', error);
    }
  };

  // Get current session helper
  const getCurrentSession = () => {
    if (!sessionId) return null;
    return (
      useRecordingSessionStore
        .getState()
        .sessions.find((s) => s.id === sessionId) || null
    );
  };

  // Get the latest events with AI descriptions
  const getCurrentEvents = (): ChromeRecordedEvent[] => {
    if (sessionId) {
      return getLatestEvents(sessionId);
    }
    return events;
  };

  // Merge: load persisted code and handle auto-generation/display logic
  useEffect(() => {
    const session = getCurrentSession();

    // If this is from stop recording, use the pinned default type
    if (isFromStopRecording && eventsCount > 0) {
      setSelectedType(defaultType);
      // Only generate code if the pinned default is not 'none'
      if (defaultType === 'playwright' || defaultType === 'yaml' || defaultType === 'textCase') {
        handleGenerateCode(defaultType);
      }
      return;
    }

    // If the pinned default is 'none', set selected type to 'none' and don't generate anything
    if (defaultType === 'none') {
      setSelectedType('none');
      return;
    }

    // Prefer loading persisted code from session
    if (session?.generatedCode) {
      if (session.generatedCode.playwright && !generatedTest) {
        setGeneratedTest(session.generatedCode.playwright);
      }
      if (session.generatedCode.yaml && !generatedYaml) {
        setGeneratedYaml(session.generatedCode.yaml);
      }
      if (session.generatedCode.textCase && !generatedTextCaseJson) {
        const parsed = parseTextCaseFromJson(session.generatedCode.textCase);
        if (parsed) {
          setGeneratedTextCase(parsed);
          setGeneratedTextCaseJson(session.generatedCode.textCase);
        }
      }
    }

    // Check if the pinned default type has generated code
    const hasDefaultTypeCode =
      defaultType === 'yaml'
        ? generatedYaml || session?.generatedCode?.yaml
        : defaultType === 'playwright'
          ? generatedTest || session?.generatedCode?.playwright
          : defaultType === 'textCase'
            ? generatedTextCaseJson || session?.generatedCode?.textCase
            : false;

    // If the pinned default type has code, show it directly
    if (hasDefaultTypeCode) {
      setSelectedType(defaultType);
      setShowGeneratedCode(true);
      return;
    }

    // If the pinned default type doesn't have code and we have events, generate it
    if (
      eventsCount > 0 &&
      (defaultType === 'playwright' || defaultType === 'yaml' || defaultType === 'textCase')
    ) {
      setSelectedType(defaultType);
      handleGenerateCode(defaultType);
    } else {
      // Set selected type to the pinned default (even if it's a valid type but no events)
      setSelectedType(defaultType);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, isFromStopRecording]);

  // Helper function to update progress step
  const updateProgressStep = (
    stepIndex: number,
    updates: Partial<ProgressStep>,
  ) => {
    setSteps((prevSteps) =>
      prevSteps.map((step, index) =>
        index === stepIndex ? { ...step, ...updates } : step,
      ),
    );
  };

  const defaultModelConfig = globalModelConfigManager.getModelConfig('default');

  // Generate session title and description using AI
  const generateSessionTitleAndDescription = async (
    finalEvents: ChromeRecordedEvent[],
    stepIndex: number,
  ): Promise<string> => {
    let currentSessionName = sessionName; // Default to the original prop

    if (sessionId) {
      const session = useRecordingSessionStore
        .getState()
        .sessions.find((s) => s.id === sessionId);

      if (
        session &&
        (!session.name || session.name.includes('-') || !session.description)
      ) {
        // Update progress: Step 1 in progress
        updateProgressStep(stepIndex, {
          status: 'loading',
          details: 'Analyzing session content...',
        });

        const { title, description } = await generateRecordTitle(
          finalEvents,
          defaultModelConfig,
        );

        if (title || description) {
          updateSession(sessionId, {
            name: title || session.name,
            description: description || session.description,
          });

          // Update the session name to use for export
          currentSessionName = title || session.name;
        }

        // Update progress: Step 1 completed
        updateProgressStep(stepIndex, {
          status: 'completed',
          details: `Generated: "${currentSessionName}"`,
        });
      } else if (session) {
        // Use the current session name from the store in case it was updated elsewhere
        currentSessionName = session.name;

        // Update progress: Step 1 completed (skipped)
        updateProgressStep(stepIndex, {
          status: 'completed',
          details: `Using existing: "${currentSessionName}"`,
        });
      }
    } else {
      // Update progress: Step 1 completed (no session)
      updateProgressStep(stepIndex, {
        status: 'completed',
        details: `Using provided: "${currentSessionName}"`,
      });
    }

    return currentSessionName;
  };

  // Generate element descriptions for events that need them
  const generateElementDescriptions = async (
    events: ChromeRecordedEvent[],
    stepIndex: number,
  ): Promise<ChromeRecordedEvent[]> => {
    const eventsNeedingDescriptions = events.filter(
      (event: ChromeRecordedEvent) =>
        event.type !== 'navigation' && event.type !== 'scroll',
    );

    if (eventsNeedingDescriptions.length === 0) {
      updateProgressStep(stepIndex, {
        status: 'completed',
        details: 'All elements already have descriptions',
      });
      return events;
    }

    updateProgressStep(stepIndex, {
      status: 'loading',
      progress: 0,
      details: `Generating descriptions for ${eventsNeedingDescriptions.length} elements...`,
    });

    let completedCount = 0;
    // const finalEvents = [...events];

    recordLogger.info('eventsNeedingDescriptions', {
      eventsNeedingDescriptions,
      events,
    });

    // Process events in parallel with progress tracking
    const optimizePromises = events.map(async (event, index) => {
      if (event.type === 'navigation' || event.type === 'scroll') {
        event.elementDescription = 'navigation or scroll';
        event.descriptionLoading = false;
        return;
      }

      try {
        let description = '';
        if (event.elementDescription && event.descriptionLoading === false) {
          description = event.elementDescription;
        } else {
          description = await generateAIDescription(event, event.hashId);
        }

        event.elementDescription = description;
        event.descriptionLoading = false;

        completedCount++;

        const progress = Math.round(
          (completedCount / eventsNeedingDescriptions.length) * 100,
        );
        updateProgressStep(stepIndex, {
          status: 'loading',
          progress,
          details: `Generated ${completedCount}/${eventsNeedingDescriptions.length} element descriptions`,
        });
      } catch (error) {
        console.error('Failed to optimize event:', error);
        event.elementDescription = 'failed to generate element description';
        event.descriptionLoading = false;
        completedCount++;
      }
    });

    await Promise.all(optimizePromises);

    // Update session with new event descriptions if sessionId exists
    if (sessionId) {
      updateSession(sessionId, {
        events,
        updatedAt: Date.now(),
      });
    }

    updateProgressStep(stepIndex, {
      status: 'completed',
      progress: 100,
      details: `Generated descriptions for ${events.length} elements`,
    });

    return events;
  };

  // Streaming callback handler factory
  const createStreamingChunkHandler =
    (targetType: 'playwright' | 'yaml'): StreamingCallback =>
    (chunk: CodeGenerationChunk) => {
      setStreamingContent(chunk.accumulated);
      const code = chunk.accumulated;
      const thinking = chunk.reasoning_content;

      // Accumulate thinking process content
      if (thinking) {
        setAccumulatedThinking((prev) => prev + thinking);
      }

      setThinkingProcess(thinking);
      setActualCode(code);

      if (chunk.isComplete) {
        setIsStreaming(false);

        // Use the actual code for final result
        const finalCode = code || chunk.accumulated;

        // Set the final generated code based on the target type, not current selectedType
        if (targetType === 'playwright') {
          setGeneratedTest(finalCode);
        } else if (targetType === 'yaml') {
          setGeneratedYaml(finalCode);
        }

        // Update session with final code
        if (sessionId) {
          updateSession(sessionId, {
            generatedCode: {
              ...getCurrentSession()?.generatedCode,
              [targetType]: finalCode,
            },
            updatedAt: Date.now(),
          });
        }
      }
    };

  // Common function to handle code generation with streaming support
  const handleCodeGeneration = async (type: 'playwright' | 'yaml' | 'textCase') => {
    // Get the most current events
    const currentEvents = getCurrentEvents();

    if (currentEvents.length === 0) {
      message.warning(`No events to generate ${type} from`);
      return;
    }

    setIsGenerating(true);
    setIsStreaming(true);
    setStreamingContent('');
    setThinkingProcess('');
    setActualCode('');
    setAccumulatedThinking('');

    // Initialize progress steps
    const progressSteps: ProgressStep[] = [
      {
        id: 'descriptions',
        title: 'Generate Element Descriptions',
        description: 'Analyzing UI elements and generating descriptions',
        status: 'pending',
      },
      {
        id: 'title',
        title: 'Generate Title & Description',
        description: 'Creating session title and description using AI',
        status: 'pending',
      },
      {
        id: type,
        title:
          type === 'playwright'
            ? 'Generate Playwright Code'
            : type === 'textCase'
              ? 'Generate Text Test Case'
              : 'Generate YAML Configuration',
        description:
          type === 'playwright'
            ? 'Creating executable Playwright test code'
            : type === 'textCase'
              ? 'Creating user-friendly test case'
              : 'Creating YAML configuration',
        status: 'pending',
      },
    ];

    setSteps(progressSteps);
    // Reset completed states
    setCompletedSteps(new Set());
    setSlidingOutSteps(new Set());
    // Hide code generation area when starting new generation
    setShowGeneratedCode(false);
    // Only clear the code that we're about to regenerate, preserve the other type
    if (type === 'playwright') {
      setGeneratedTest('');
    } else if (type === 'yaml') {
      setGeneratedYaml('');
    } else if (type === 'textCase') {
      setGeneratedTextCase(null);
      setGeneratedTextCaseJson('');
    }

    try {
      // Step 0: Stop recording if currently recording
      await stopRecordingIfActive(onStopRecording);

      // After stopping recording, get the latest events from session
      let finalEvents = getCurrentEvents();
      recordLogger.info('start generating code', {
        finalEvents,
        sessionId,
      });

      // Step 1: Generate element descriptions
      updateProgressStep(0, { status: 'loading' });
      finalEvents = await generateElementDescriptions(finalEvents, 0);
      recordLogger.info('Generated element descriptions', {
        finalEvents,
        sessionId,
      });

      await new Promise((resolve) => setTimeout(resolve, 500));

      // Step 2: Generate session title and description if not already generated
      updateProgressStep(1, { status: 'loading' });

      finalEvents = getCurrentEvents();
      const currentSessionName = await generateSessionTitleAndDescription(
        finalEvents,
        1,
      );

      await new Promise((resolve) => setTimeout(resolve, 500));

      recordLogger.info('Generated session title and description', {
        finalEvents,
        sessionId,
        currentSessionName,
      });

      // Step 3: Generate code with streaming support
      updateProgressStep(2, {
        status: 'loading',
        details:
          type === 'playwright'
            ? 'Generating Playwright test code...'
            : type === 'textCase'
              ? 'Generating text test case...'
              : 'Generating YAML configuration...',
      });

      finalEvents = getCurrentEvents();

      // Show the code generation area immediately when streaming starts
      setShowGeneratedCode(true);

      let generatedCode: string;

      if (type === 'playwright') {
        // Use streaming for Playwright
        const streamingResult = await generatePlaywrightTestStream(
          finalEvents,
          {
            stream: true,
            onChunk: createStreamingChunkHandler(type),
          },
          defaultModelConfig,
        );
        generatedCode = streamingResult.content;
      } else if (type === 'textCase') {
        // Use streaming for Text Case
        const streamingResult = await generateTextCaseStream(
          finalEvents,
          {
            stream: true,
            onChunk: (chunk) => {
              setStreamingContent(chunk.accumulated);
              if (chunk.reasoning_content) {
                setAccumulatedThinking((prev) => prev + chunk.reasoning_content);
              }
              setActualCode(chunk.accumulated);
              if (chunk.isComplete) {
                const parsed = parseTextCaseFromJson(chunk.accumulated);
                if (parsed) {
                  setGeneratedTextCase(parsed);
                  setGeneratedTextCaseJson(chunk.accumulated);
                }
              }
            },
            testName: currentSessionName,
          },
          defaultModelConfig,
        );
        generatedCode = streamingResult.content;
        // Try to parse the result
        const parsed = parseTextCaseFromJson(generatedCode);
        if (parsed) {
          setGeneratedTextCase(parsed);
          setGeneratedTextCaseJson(generatedCode);
        }
      } else {
        // Use streaming for YAML
        const streamingResult = await generateYamlTestStream(
          finalEvents,
          {
            stream: true,
            onChunk: createStreamingChunkHandler(type),
            testName: currentSessionName,
            description: `Test session recorded on ${new Date().toLocaleDateString()}`,
            includeTimestamps: true,
          },
          defaultModelConfig,
        );
        generatedCode = streamingResult.content;
      }

      // Update session with generated code if sessionId exists
      if (sessionId) {
        // For textCase, use generatedCode directly since setState is async
        const codeToUpdate = type === 'textCase' ? generatedCode : generatedCode;
        updateSession(sessionId, {
          generatedCode: {
            ...getCurrentSession()?.generatedCode,
            [type]: codeToUpdate,
          },
          updatedAt: Date.now(),
        });
      }

      // Set the generated code in state
      if (type === 'playwright') {
        setGeneratedTest(generatedCode);
      } else if (type === 'yaml') {
        setGeneratedYaml(generatedCode);
      }

      // Mark all steps as completed
      progressSteps.forEach((_, index) => {
        updateProgressStep(index, { status: 'completed' });
      });

      // Show the generated code after generation is complete
      setShowGeneratedCode(true);

      // Show success message
      const typeLabel = type === 'playwright' 
        ? 'Playwright test' 
        : type === 'textCase' 
          ? 'Text test case' 
          : 'YAML configuration';
      message.success(`AI ${typeLabel} generated successfully!`);
    } catch (error) {
      recordLogger.error(`Failed to generate ${type}`, undefined, error);

      // Update current step to error status
      const currentStep = steps.findIndex((step) => step.status === 'loading');
      if (currentStep >= 0) {
        updateProgressStep(currentStep, {
          status: 'error',
          details: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }

      setTimeout(() => {
        message.error(
          `Failed to generate ${type}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }, 2000);
    } finally {
      setIsGenerating(false);
      setIsStreaming(false);
    }
  };

  // Function to handle code generation from dropdown
  const handleGenerateCode = async (type: CodeGenerationType) => {
    if (getCurrentEvents().length === 0 || type === 'none') {
      return;
    }

    await handleCodeGeneration(type);
  };

  // Copy generated test to clipboard
  const handleCopyTest = () => {
    navigator.clipboard.writeText(generatedTest);
    message.success('Test copied to clipboard');
  };

  // Copy generated YAML to clipboard
  const handleCopyYaml = () => {
    navigator.clipboard.writeText(generatedYaml);
    message.success('YAML copied to clipboard');
  };

  // Download generated test as a TypeScript file
  const handleDownloadTest = () => {
    const downloadSessionName = resolveSessionName(sessionName, sessionId);

    const dataBlob = new Blob([generatedTest], {
      type: 'application/typescript',
    });
    const url = URL.createObjectURL(dataBlob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `${downloadSessionName}-playwright-test.ts`;
    link.click();

    URL.revokeObjectURL(url);
    message.success(
      `Playwright script for "${downloadSessionName}" downloaded successfully`,
    );
  };

  // Download generated YAML as a YAML file
  const handleDownloadYaml = () => {
    const downloadSessionName = resolveSessionName(sessionName, sessionId);

    const dataBlob = new Blob([generatedYaml], {
      type: 'application/x-yaml',
    });
    const url = URL.createObjectURL(dataBlob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `${downloadSessionName}-test.yaml`;
    link.click();

    URL.revokeObjectURL(url);
    message.success(
      `YAML script for "${downloadSessionName}" downloaded successfully`,
    );
  };

  // Regenerate Playwright test
  const handleRegenerateTest = async () => {
    await handleCodeGeneration('playwright');
  };

  // Regenerate YAML test
  const handleRegenerateYaml = async () => {
    await handleCodeGeneration('yaml');
  };

  // Handle text case change from TextCaseView
  const handleTextCaseChange = (updatedTextCase: TextCase) => {
    setGeneratedTextCase(updatedTextCase);
    setGeneratedTextCaseJson(JSON.stringify(updatedTextCase, null, 2));
  };

  // Handle JS script generated from TextCaseView
  const handleJsScriptGenerated = (jsScript: string) => {
    setGeneratedJsScript(jsScript);
  };

  // Monitor step completion state changes, add sliding animation
  useEffect(() => {
    steps.forEach((step) => {
      if (step.status === 'completed' && !completedSteps.has(step.id)) {
        // Mark as sliding out state
        setSlidingOutSteps((prev) => new Set([...prev, step.id]));

        // Mark as completed after 500ms (remove from DOM)
        setTimeout(() => {
          setCompletedSteps((prev) => new Set([...prev, step.id]));
          setSlidingOutSteps((prev) => {
            const newSet = new Set(prev);
            newSet.delete(step.id);
            return newSet;
          });
        }, 500);
      }
    });
  }, [steps, completedSteps]);

  // Reset state when starting new generation
  const handleSelectChange = (value: CodeGenerationType) => {
    console.log('handleSelectChange', value);
    setSelectedType(value);

    if (value === 'playwright') {
      // Don't clear yaml code, just check if playwright code exists
      if (generatedTest) {
        setShowGeneratedCode(true);
      } else {
        setShowGeneratedCode(false);
        if (!isGenerating) {
          handleGenerateCode(value);
        }
      }
    } else if (value === 'yaml') {
      // Don't clear playwright code, just check if yaml code exists
      if (generatedYaml) {
        setShowGeneratedCode(true);
      } else {
        setShowGeneratedCode(false);
        if (!isGenerating) {
          handleGenerateCode(value);
        }
      }
    } else if (value === 'textCase') {
      // Check if text case exists
      if (generatedTextCase) {
        setShowGeneratedCode(true);
      } else {
        setShowGeneratedCode(false);
        if (!isGenerating) {
          handleGenerateCode(value);
        }
      }
    } else if (value === 'none') {
      setShowGeneratedCode(false);
      // Don't clear generated code when selecting 'none', preserve it for future switches
    } else {
      setShowGeneratedCode(false);
    }
  };

  const codeTypeOptions = [
    {
      label: (
        <>
          <CodeOutlined className="text-blue-500" /> Playwright
        </>
      ),
      value: 'playwright' as const,
    },
    {
      label: (
        <>
          <FileTextOutlined className="text-green-500" /> YAML
        </>
      ),
      value: 'yaml' as const,
    },
    {
      label: (
        <>
          <FileTextOutlined className="text-orange-500" /> Text Case
        </>
      ),
      value: 'textCase' as const,
    },
    { label: 'None', value: 'none' as const },
  ];

  const getStepIcon = (step: ProgressStep) => {
    switch (step.status) {
      case 'loading':
        return <LoadingOutlined style={{ color: '#1890ff' }} />;
      case 'completed':
        return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
      case 'error':
        return <CheckCircleOutlined style={{ color: '#ff4d4f' }} />;
      default:
        return (
          <div
            style={{
              width: 14,
              height: 14,
              borderRadius: '50%',
              backgroundColor: '#d9d9d9',
            }}
          />
        );
    }
  };

  const getStepColor = (step: ProgressStep) => {
    switch (step.status) {
      case 'loading':
        return '#1890ff';
      case 'completed':
        return '#52c41a';
      case 'error':
        return '#ff4d4f';
      default:
        return '#d9d9d9';
    }
  };

  const thirdStepStarted =
    steps.length >= 3 &&
    (steps[2].status === 'loading' ||
      steps[2].status === 'completed' ||
      steps[2].status === 'error');

  return (
    <>
      {eventsCount === 0 ? (
        <div className="text-center text-gray-400 py-5">
          <div className="text-lg mb-2">No events to generate code from</div>
          <div className="text-sm">Record some interactions first</div>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-4">
            <Select
              value={selectedType}
              onChange={(value) => {
                // Prevent selecting "None" directly - only allow through pin icon
                if (value === 'none') {
                  return;
                }
                handleSelectChange(value);
              }}
              className="w-60"
              size="middle"
              suffixIcon={<DownOutlined />}
              disabled={isGenerating}
            >
              {codeTypeOptions.map((option) => (
                <Select.Option
                  key={option.value}
                  value={option.value}
                  disabled={option.value === 'none'}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={option.value === 'none' ? 'text-gray-400' : ''}
                    >
                      {option.label}
                    </span>
                    <div className="flex items-center gap-1">
                      <Tooltip
                        title={
                          option.value === 'none'
                            ? 'Click to set None as default (no auto-generation)'
                            : 'Pin as default code generation type'
                        }
                      >
                        {defaultType === option.value ? (
                          <PushpinFilled
                            className="text-blue-500 cursor-pointer hover:text-blue-600 ml-1"
                            onClick={(e) => {
                              e.stopPropagation();
                              updateDefaultType(option.value);
                              // If pinning "None", also set it as selected type
                              if (option.value === 'none') {
                                setSelectedType('none');
                                handleSelectChange('none');
                              }
                            }}
                          />
                        ) : (
                          <PushpinOutlined
                            className="text-gray-400 cursor-pointer hover:text-gray-600 ml-1"
                            onClick={(e) => {
                              e.stopPropagation();
                              updateDefaultType(option.value);
                              // If pinning "None", also set it as selected type
                              if (option.value === 'none') {
                                setSelectedType('none');
                                handleSelectChange('none');
                              }
                            }}
                          />
                        )}
                      </Tooltip>
                    </div>
                  </div>
                </Select.Option>
              ))}
            </Select>
            {(selectedType === 'playwright' || selectedType === 'yaml') &&
              (showGeneratedCode || isStreaming) && (
                <div className="flex gap-0.2 ml-auto">
                  <Button
                    size="small"
                    icon={<CopyOutlined />}
                    onClick={
                      selectedType === 'playwright'
                        ? handleCopyTest
                        : handleCopyYaml
                    }
                    className="!border-none !bg-none !shadow-none"
                    disabled={
                      isStreaming ||
                      (selectedType === 'playwright'
                        ? !generatedTest
                        : !generatedYaml)
                    }
                    title="Copy to clipboard"
                  />
                  <Button
                    size="small"
                    icon={<ReloadOutlined />}
                    onClick={
                      selectedType === 'playwright'
                        ? handleRegenerateTest
                        : handleRegenerateYaml
                    }
                    disabled={isGenerating || isStreaming}
                    className="!border-none !bg-none !shadow-none"
                    title="Regenerate code"
                  />
                  <Button
                    size="small"
                    icon={<DownloadOutlined />}
                    className="!border-none !bg-none !shadow-none"
                    onClick={
                      selectedType === 'playwright'
                        ? handleDownloadTest
                        : handleDownloadYaml
                    }
                    disabled={
                      isStreaming ||
                      (selectedType === 'playwright'
                        ? !generatedTest
                        : !generatedYaml)
                    }
                    title={
                      selectedType === 'playwright'
                        ? 'Download as .ts file'
                        : 'Download as .yaml file'
                    }
                  />
                </div>
              )}
            {selectedType === 'textCase' && (showGeneratedCode || isStreaming) && (
              <div className="flex gap-0.2 ml-auto">
                <Button
                  size="small"
                  icon={<CopyOutlined />}
                  onClick={() => {
                    if (generatedTextCaseJson) {
                      navigator.clipboard.writeText(generatedTextCaseJson);
                      message.success('测试用例已复制到剪贴板');
                    }
                  }}
                  className="!border-none !bg-none !shadow-none"
                  disabled={isStreaming || !generatedTextCaseJson}
                  title="复制到剪贴板"
                />
                <Button
                  size="small"
                  icon={<ReloadOutlined />}
                  onClick={() => handleCodeGeneration('textCase')}
                  disabled={isGenerating || isStreaming}
                  className="!border-none !bg-none !shadow-none"
                  title="重新生成"
                />
                <Button
                  size="small"
                  icon={<DownloadOutlined />}
                  className="!border-none !bg-none !shadow-none"
                  onClick={() => {
                    const downloadSessionName = resolveSessionName(sessionName, sessionId);
                    const dataBlob = new Blob([generatedTextCaseJson], { type: 'application/json' });
                    const url = URL.createObjectURL(dataBlob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = `${downloadSessionName}-test-case.json`;
                    link.click();
                    URL.revokeObjectURL(url);
                    message.success('测试用例已下载');
                  }}
                  disabled={isStreaming || !generatedTextCaseJson}
                  title="下载 JSON"
                />
              </div>
            )}
          </div>
          {selectedType === 'none' && (
            <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded text-yellow-800 text-sm">
              <div className="font-semibold mb-1">
                No Code Generation Selected
              </div>
              <div>
                Selecting <b>None</b> means no code will be generated
                automatically.
              </div>
              <div className="mt-1">
                To auto-generate <b>YAML</b> or <b>Playwright</b> code, set it
                as the default (click the pin icon on the right).
                <br />
                When you stop recording, the system will automatically generate
                code for the default type.
              </div>
            </div>
          )}
        </>
      )}

      {/* Steps for selectedType only */}
      {steps.length > 0 &&
        // !steps.every((step) => step.status === 'completed') &&
        (() => {
          // Hide step display if the third step has started
          if (thirdStepStarted) {
            return null;
          }

          return (
            <StepList
              steps={steps}
              completedSteps={completedSteps}
              slidingOutSteps={slidingOutSteps}
              getStepIcon={getStepIcon}
              getStepColor={getStepColor}
            />
          );
        })()}

      {/* Code block for selectedType only */}
      {(showGeneratedCode || isStreaming) && (
        <>
          {selectedType === 'playwright' &&
            (generatedTest ||
              (isStreaming && selectedType === 'playwright')) && (
              <CodeBlock
                key={'playwright'}
                code={generatedTest}
                type={'playwright'}
                loading={isGenerating}
                isStreaming={isStreaming && selectedType === 'playwright'}
                streamingContent={streamingContent}
                thinkingProcess={thinkingProcess}
                actualCode={actualCode}
                accumulatedThinking={accumulatedThinking}
                stepDisplay={thirdStepStarted || steps.length === 0}
              />
            )}
          {selectedType === 'yaml' &&
            (generatedYaml || (isStreaming && selectedType === 'yaml')) && (
              <CodeBlock
                key={'yaml'}
                code={generatedYaml}
                type={'yaml'}
                loading={isGenerating}
                isStreaming={isStreaming && selectedType === 'yaml'}
                streamingContent={streamingContent}
                thinkingProcess={thinkingProcess}
                actualCode={actualCode}
                accumulatedThinking={accumulatedThinking}
                stepDisplay={thirdStepStarted || steps.length === 0}
              />
            )}
          {selectedType === 'textCase' && (
            <TextCaseView
              textCase={generatedTextCase}
              loading={isGenerating && !generatedTextCase}
              isStreaming={isStreaming && selectedType === 'textCase'}
              streamingContent={streamingContent}
              onTextCaseChange={handleTextCaseChange}
              onJsScriptGenerated={handleJsScriptGenerated}
              jsScript={generatedJsScript}
              onSync={handleSyncToDonggui}
              onNavigateToDetail={handleNavigateToDetail}
              syncedCaseId={syncedCaseId}
            />
          )}
        </>
      )}
    </>
  );
};
