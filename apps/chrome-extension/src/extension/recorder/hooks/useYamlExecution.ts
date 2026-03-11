import { message } from 'antd';
import { useCallback, useState } from 'react';
import yaml from 'js-yaml';
import {
  ChromeExtensionProxyPage,
  ChromeExtensionProxyPageAgent,
} from '@midscene/web/chrome-extension';
import type { Agent } from '@midscene/core';

export interface YamlTask {
  name?: string;
  stepId?: number;
  continueOnError?: boolean;
  flow: YamlFlowItem[];
}

export interface YamlFlowItem {
  aiTap?: string;
  aiAct?: string;
  aiAction?: string;
  aiAssert?: string;
  aiQuery?: string;
  aiInput?: string;
  aiScroll?: string;
  aiWaitFor?: string;
  ai?: string;
  sleep?: number;
  deepThink?: boolean;
  errorMessage?: string;
  locate?: string;
  value?: string | number;
  timeout?: number;
}

export interface YamlScript {
  target?: {
    url?: string;
  };
  tasks: YamlTask[];
}

export interface ExecutionState {
  status: 'idle' | 'running' | 'success' | 'error';
  currentTaskIndex: number;
  currentStepIndex: number;
  logs: string[];
  error?: string;
}

const initialState: ExecutionState = {
  status: 'idle',
  currentTaskIndex: 0,
  currentStepIndex: 0,
  logs: [],
};

export function useYamlExecution() {
  const [state, setState] = useState<ExecutionState>(initialState);
  const [agent, setAgent] = useState<Agent | null>(null);

  const addLog = useCallback((log: string) => {
    setState(prev => ({
      ...prev,
      logs: [...prev.logs, `[${new Date().toLocaleTimeString()}] ${log}`],
    }));
  }, []);

  const parseYaml = useCallback((yamlContent: string): YamlScript | null => {
    try {
      const parsed = yaml.load(yamlContent, { schema: yaml.JSON_SCHEMA }) as YamlScript;
      if (!parsed.tasks || !Array.isArray(parsed.tasks)) {
        throw new Error('Invalid YAML: missing "tasks" array');
      }
      return parsed;
    } catch (error) {
      console.error('[YamlExecution] Failed to parse YAML:', error);
      message.error(`Failed to parse YAML: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return null;
    }
  }, []);

  const executeFlowItem = useCallback(async (
    agent: Agent,
    flowItem: YamlFlowItem,
    addLog: (log: string) => void,
  ): Promise<void> => {
    const options = flowItem.deepThink ? { deepThink: true as const } : undefined;

    if (flowItem.sleep !== undefined) {
      const ms = flowItem.sleep;
      addLog(`Sleeping for ${ms}ms...`);
      await new Promise(resolve => setTimeout(resolve, ms));
      return;
    }

    if (flowItem.aiTap) {
      addLog(`Executing aiTap: ${flowItem.aiTap}`);
      await agent.aiTap(flowItem.aiTap, options);
      return;
    }

    if (flowItem.ai) {
      addLog(`Executing ai: ${flowItem.ai}`);
      await agent.aiAction(flowItem.ai, options);
      return;
    }

    if (flowItem.aiAct || flowItem.aiAction) {
      const prompt = flowItem.aiAct || flowItem.aiAction!;
      addLog(`Executing aiAction: ${prompt}`);
      await agent.aiAction(prompt, options);
      return;
    }

    if (flowItem.aiAssert) {
      addLog(`Executing aiAssert: ${flowItem.aiAssert}`);
      const result = await agent.aiAssert(flowItem.aiAssert, flowItem.errorMessage);
      if (result && !result.pass) {
        throw new Error(flowItem.errorMessage || `Assertion failed: ${result.message}`);
      }
      if (result) {
        addLog(`Assertion passed: ${result.thought}`);
      }
      return;
    }

    if (flowItem.aiQuery) {
      addLog(`Executing aiQuery: ${flowItem.aiQuery}`);
      const result = await agent.aiQuery(flowItem.aiQuery);
      addLog(`Query result: ${JSON.stringify(result)}`);
      return;
    }

    if (flowItem.aiWaitFor) {
      const assertion = flowItem.aiWaitFor;
      const timeoutMs = flowItem.timeout || 15000;
      addLog(`Executing aiWaitFor: ${assertion} (timeout: ${timeoutMs}ms)`);
      await agent.aiWaitFor(assertion, { timeoutMs });
      addLog(`Condition satisfied: ${assertion}`);
      return;
    }

    if (flowItem.aiInput) {
      const inputValue = flowItem.aiInput;
      const locatePrompt = flowItem.locate;
      if (!locatePrompt) {
        throw new Error('aiInput operation missing "locate" field. Please check YAML format.');
      }
      addLog(`Executing aiInput: input "${inputValue}" into "${locatePrompt}"`);
      await agent.aiInput(locatePrompt, { 
        value: inputValue,
        ...options 
      });
      return;
    }

    if (flowItem.aiScroll) {
      addLog(`Executing aiScroll: ${flowItem.aiScroll}`);
      await agent.aiScroll(flowItem.aiScroll, {});
      return;
    }

    throw new Error(`Unknown flow item type: ${JSON.stringify(flowItem)}`);
  }, []);

  const executeYaml = useCallback(async (yamlContent: string) => {
    const script = parseYaml(yamlContent);
    if (!script) {
      return;
    }

    if (!script.tasks || script.tasks.length === 0) {
      message.error('No tasks to execute');
      return;
    }

    console.log('[YamlExecution] Starting YAML execution:', script);
    setState({
      status: 'running',
      currentTaskIndex: 0,
      currentStepIndex: 0,
      logs: [],
    });

    let currentAgent: Agent | null = null;

    try {
      currentAgent = createAgent();
      setAgent(currentAgent);
      addLog('Agent created successfully');

      for (let taskIndex = 0; taskIndex < script.tasks.length; taskIndex++) {
        const task = script.tasks[taskIndex];
        const taskName = task.name || `Task ${taskIndex + 1}`;
        addLog(`Starting task ${taskIndex + 1}: ${taskName}`);
        
        setState(prev => ({
          ...prev,
          currentTaskIndex: taskIndex,
          currentStepIndex: 0,
        }));

        for (let stepIndex = 0; stepIndex < task.flow.length; stepIndex++) {
          const flowItem = task.flow[stepIndex];
          
          setState(prev => ({
            ...prev,
            currentStepIndex: stepIndex,
          }));

          try {
            await executeFlowItem(currentAgent, flowItem, addLog);
            addLog(`Step ${stepIndex + 1} completed`);
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            addLog(`Step ${stepIndex + 1} failed: ${errorMessage}`);
            
            if (!task.continueOnError) {
              throw error;
            }
            addLog(`Continuing to next step (continueOnError: true)`);
          }
        }

        addLog(`Task ${taskIndex + 1} completed: ${taskName}`);
      }

      setState(prev => ({
        ...prev,
        status: 'success',
      }));
      addLog('YAML execution completed successfully!');
      message.success('Script executed successfully!');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[YamlExecution] Execution error:', error);
      addLog(`Execution failed: ${errorMessage}`);
      setState(prev => ({
        ...prev,
        status: 'error',
        error: errorMessage,
      }));
      message.error(`Execution failed: ${errorMessage}`);
    } finally {
      if (currentAgent && currentAgent.interface) {
        try {
          const interfaceInstance = currentAgent.interface;
          if (interfaceInstance && typeof interfaceInstance.destroy === 'function') {
            await interfaceInstance.destroy();
          }
          addLog('Agent destroyed');
        } catch (e) {
          console.error('[YamlExecution] Error destroying agent:', e);
        }
      }
      setAgent(null);
    }
  }, [parseYaml, addLog, executeFlowItem]);

  const stopExecution = useCallback(() => {
    if (agent && agent.interface) {
      try {
        const interfaceInstance = agent.interface;
        if (interfaceInstance && typeof interfaceInstance.destroy === 'function') {
          interfaceInstance.destroy();
        }
      } catch (e) {
        console.error('[YamlExecution] Error stopping execution:', e);
      }
    }
    setAgent(null);
    setState(prev => ({
      ...prev,
      status: 'idle',
    }));
    addLog('Execution stopped by user');
    message.info('Execution stopped');
  }, [agent, addLog]);

  const resetState = useCallback(() => {
    setState(initialState);
  }, []);

  return {
    state,
    executeYaml,
    stopExecution,
    resetState,
    isExecuting: state.status === 'running',
  };
}

function createAgent(): Agent {
  const page = new ChromeExtensionProxyPage(true);
  return new ChromeExtensionProxyPageAgent(page);
}
