import { Button, Card, Empty, Spin, Tag, message, Typography, Modal, Input, Select, Popconfirm, Tabs, Tooltip, Result } from 'antd';
import { 
  ArrowLeftOutlined, 
  EditOutlined,
  PlusOutlined,
  DeleteOutlined,
  SaveOutlined,
  CloseOutlined,
  UpOutlined,
  DownOutlined,
  CloudUploadOutlined,
  UnorderedListOutlined,
  CodeOutlined,
  LoadingOutlined,
  PlayCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import { useEffect, useState, useCallback } from 'react';
import type { ScriptDetail, ScriptTask, ScriptFlowItem } from '../types';
import { fetchScriptDetail } from '../api';
import './ScriptDetail.less';
import yaml from 'js-yaml';
import { globalModelConfigManager } from '@midscene/shared/env';
import { generateJsScriptFromTextCase, parseTextCaseData } from '../../recorder/generators';
import type { TextCaseData, TextCaseStep } from '../../recorder/generators/textCaseToJsGenerator';
import { triggerConfetti } from '../../recorder/components/ProgressModal/confetti';

const { Text } = Typography;
const { Option } = Select;
const { TextArea } = Input;

const StarIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path 
      d="M6.46176 1.39664C6.65672 0.875293 6.7542 0.614622 6.91268 0.570766C6.96897 0.555187 7.02843 0.555187 7.08472 0.570766C7.2432 0.614622 7.34068 0.875293 7.53564 1.39663C8.1253 2.97341 8.42013 3.7618 8.9368 4.38752C9.13238 4.62438 9.35007 4.84207 9.58692 5.03764C10.2126 5.55432 11.001 5.84915 12.5778 6.43881C13.0992 6.63377 13.3598 6.73125 13.4037 6.88973C13.4193 6.94602 13.4193 7.00548 13.4037 7.06177C13.3598 7.22025 13.0992 7.31773 12.5778 7.51269C11.001 8.10235 10.2126 8.39718 9.58692 8.91386C9.35007 9.10943 9.13238 9.32712 8.9368 9.56397C8.42013 10.1897 8.1253 10.9781 7.53564 12.5549C7.34068 13.0762 7.2432 13.3369 7.08472 13.3807C7.02843 13.3963 6.96897 13.3963 6.91268 13.3807C6.7542 13.3369 6.65672 13.0762 6.46176 12.5549C5.8721 10.9781 5.57727 10.1897 5.06059 9.56397C4.86501 9.32712 4.64733 9.10943 4.41047 8.91386C3.78475 8.39718 2.99636 8.10235 1.41958 7.51269C0.898242 7.31773 0.637572 7.22025 0.593715 7.06177C0.578137 7.00548 0.578137 6.94602 0.593715 6.88973C0.637572 6.73125 0.898242 6.63377 1.41958 6.43881C2.99636 5.84915 3.78475 5.55432 4.41047 5.03764C4.64733 4.84207 4.86501 4.62438 5.06059 4.38752C5.57727 3.7618 5.8721 2.97341 6.46176 1.39664Z" 
      fill="currentColor"
    />
  </svg>
);

interface ParsedStep {
  description: string;
  type: 'step' | 'assert';
  stepId: number;
  code: string;
}

interface ScriptDetailProps {
  scriptId: number;
  scriptTitle: string;
  onBack: () => void;
}

type FlowActionType = 'aiTap' | 'aiInput' | 'aiAssert' | 'aiAct' | 'aiWaitFor' | 'sleep';

interface FlowActionConfig {
  type: FlowActionType;
  label: string;
  placeholder: string;
  needsValue: boolean;
  needsLocate?: boolean;
}

const FLOW_ACTION_CONFIGS: FlowActionConfig[] = [
  { type: 'aiTap', label: '点击', placeholder: '请输入元素描述，如：搜索按钮', needsValue: true },
  { type: 'aiInput', label: '输入', placeholder: '请输入要输入的内容', needsValue: true, needsLocate: true },
  { type: 'aiAssert', label: '断言', placeholder: '请输入断言内容，如：页面显示搜索结果', needsValue: true },
  { type: 'aiAct', label: '操作', placeholder: '请输入操作描述', needsValue: true },
  { type: 'aiWaitFor', label: '等待', placeholder: '请输入等待条件', needsValue: true },
  { type: 'sleep', label: '固定等待(ms)', placeholder: '请输入等待毫秒数', needsValue: true },
];

const API_BASE_URL = 'https://joy-ai-test.jd.com';

function parseAutoCaseDetail(autoCaseDetail: string): ParsedStep[] {
  const steps: ParsedStep[] = [];
  
  const extractCodeBlock = (str: string, startIndex: number): { code: string; endIndex: number } | null => {
    let braceCount = 0;
    let inBlock = false;
    let i = startIndex;
    
    while (i < str.length) {
      const char = str[i];
      if (char === '{') {
        braceCount++;
        inBlock = true;
      } else if (char === '}') {
        braceCount--;
        if (inBlock && braceCount === 0) {
          return {
            code: str.substring(startIndex, i),
            endIndex: i,
          };
        }
      }
      i++;
    }
    return null;
  };
  
  const stepPattern = /joyTest\.executeStep\s*\(\s*`([^`]+)`\s*,\s*async\s*\(\s*\)\s*=>\s*\{/g;
  let stepMatch;
  while ((stepMatch = stepPattern.exec(autoCaseDetail)) !== null) {
    const blockStart = stepMatch.index + stepMatch[0].length;
    const blockResult = extractCodeBlock(autoCaseDetail, blockStart);
    if (blockResult) {
      const afterBlock = autoCaseDetail.substring(blockResult.endIndex + 1);
      const stepIdMatch = afterBlock.match(/^\s*,\s*(\d+)\s*\)/);
      if (stepIdMatch) {
        steps.push({
          description: stepMatch[1],
          type: 'step',
          stepId: parseInt(stepIdMatch[1]),
          code: blockResult.code.trim(),
        });
      }
    }
  }
  
  const assertPattern = /joyTest\.executeAssert\s*\(\s*`([^`]+)`\s*,\s*(?:`([^`]+)`|'([^']+)'|"([^"]+)")\s*,\s*async\s*\(\s*\)\s*=>\s*\{/g;
  let assertMatch;
  while ((assertMatch = assertPattern.exec(autoCaseDetail)) !== null) {
    const blockStart = assertMatch.index + assertMatch[0].length;
    const blockResult = extractCodeBlock(autoCaseDetail, blockStart);
    if (blockResult) {
      const afterBlock = autoCaseDetail.substring(blockResult.endIndex + 1);
      const stepIdMatch = afterBlock.match(/^\s*,\s*(\d+)\s*\)/);
      if (stepIdMatch) {
        steps.push({
          description: assertMatch[1],
          type: 'assert',
          stepId: parseInt(stepIdMatch[1]),
          code: blockResult.code.trim(),
        });
      }
    }
  }
  
  steps.sort((a, b) => a.stepId - b.stepId);
  
  return steps;
}

function getFlowItemDescription(flowItem: ScriptFlowItem): string {
  if (flowItem.aiTap) return `点击${flowItem.aiTap}`;
  if (flowItem.aiAct) return flowItem.aiAct;
  if (flowItem.aiAct) return flowItem.aiAct;
  if (flowItem.aiAssert) return `断言${flowItem.aiAssert}`;
  if (flowItem.aiQuery) return flowItem.aiQuery;
  if (flowItem.aiInput) return `在${flowItem.locate || flowItem.aiInput}输入"${flowItem.aiInput}"`;
  if (flowItem.aiWaitFor) return `等待${flowItem.aiWaitFor}`;
  if (flowItem.ai) return flowItem.ai;
  if (flowItem.sleep !== undefined) return `等待${flowItem.sleep}毫秒`;
  return 'Unknown action';
}

const getFlowItemType = (flowItem: ScriptFlowItem): string => {
  if (flowItem.aiTap) return '点击';
  if (flowItem.aiAct || flowItem.aiAct || flowItem.ai) return '操作';
  if (flowItem.aiAssert) return '断言';
  if (flowItem.aiQuery) return '查询';
  if (flowItem.aiInput) return '输入';
  if (flowItem.aiWaitFor) return '等待';
  if (flowItem.sleep !== undefined) return '等待';
  return '未知';
};

export function ScriptDetail({
  scriptId,
  scriptTitle,
  onBack,
}: ScriptDetailProps) {
  const [script, setScript] = useState<ScriptDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsedSteps, setParsedSteps] = useState<ParsedStep[]>([]);
  const [parsedTasks, setParsedTasks] = useState<ScriptTask[]>([]);
  const [caseDetailData, setCaseDetailData] = useState<TextCaseData | null>(null);
  const [editingCaseDetail, setEditingCaseDetail] = useState<TextCaseData | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingTasks, setEditingTasks] = useState<ScriptTask[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isGeneratingJs, setIsGeneratingJs] = useState(false);
  const [activeTab, setActiveTab] = useState<'steps' | 'code'>('steps');
  const [generatedJsScript, setGeneratedJsScript] = useState('');
  const [hasUnsavedJsScript, setHasUnsavedJsScript] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionStepIndex, setExecutionStepIndex] = useState(-1);
  const [executionStepStatus, setExecutionStepStatus] = useState<Record<number, 'pending' | 'running' | 'success' | 'failed'>>({});
  const [executionResult, setExecutionResult] = useState<'success' | 'failed' | null>(null);
  const [executionError, setExecutionError] = useState<string | null>(null);
  
  const [editStepModalVisible, setEditStepModalVisible] = useState(false);
  const [editingStepIndex, setEditingStepIndex] = useState(-1);
  const [editStepForm, setEditStepForm] = useState({
    description: '',
    expect: '',
  });

  const [insertStepModalVisible, setInsertStepModalVisible] = useState(false);
  const [insertStepPosition, setInsertStepPosition] = useState<{ index: number; direction: 'up' | 'down' }>({ index: 0, direction: 'down' });
  const [insertStepForm, setInsertStepForm] = useState({
    description: '',
    expect: '',
  });
  
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingFlowItem, setEditingFlowItem] = useState<{ taskIndex: number; flowIndex: number; item: ScriptFlowItem } | null>(null);
  const [editForm, setEditForm] = useState<{
    actionType: FlowActionType;
    value: string;
    locate: string;
    deepThink: boolean;
  }>({
    actionType: 'aiTap',
    value: '',
    locate: '',
    deepThink: false,
  });

  const [insertModalVisible, setInsertModalVisible] = useState(false);
  const [insertPosition, setInsertPosition] = useState<{ taskIndex: number; flowIndex: number; direction: 'up' | 'down' }>({ taskIndex: 0, flowIndex: 0, direction: 'down' });
  const [insertForm, setInsertForm] = useState<{
    actionType: FlowActionType;
    value: string;
    locate: string;
    deepThink: boolean;
  }>({
    actionType: 'aiTap',
    value: '',
    locate: '',
    deepThink: false,
  });

  const loadScriptDetail = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchScriptDetail(scriptId);

      if (response.code === 200 && response.data) {
        setScript(response.data);
        
        if (response.data.autoCaseDetail) {
          const steps = parseAutoCaseDetail(response.data.autoCaseDetail);
          setParsedSteps(steps);
        }
        
        if (response.data.caseDetail) {
          const parsed = parseTextCaseData(response.data.caseDetail);
          if (parsed) {
            setCaseDetailData(parsed);
          }
        }
        
        if (response.data.yamlScript) {
          try {
            const parsed = yaml.load(response.data.yamlScript) as { tasks: ScriptTask[] };
            setParsedTasks(parsed.tasks || []);
            setEditingTasks(JSON.parse(JSON.stringify(parsed.tasks || [])));
          } catch (e) {
            console.error('[ScriptDetail] Failed to parse YAML:', e);
            setParsedTasks([]);
            setEditingTasks([]);
          }
        } else {
          setParsedTasks([]);
          setEditingTasks([]);
        }
      } else {
        setError(response.message || 'Failed to load script detail');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load script detail');
      console.error('[ScriptDetail] Error loading script detail:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadScriptDetail();
  }, [scriptId]);

  const handleEnterEditMode = () => {
    setEditingTasks(JSON.parse(JSON.stringify(parsedTasks)));
    if (caseDetailData) {
      setEditingCaseDetail(JSON.parse(JSON.stringify(caseDetailData)));
    }
    setIsEditMode(true);
    setActiveTab('steps');
  };

  const handleCancelEdit = () => {
    setIsEditMode(false);
    setEditingTasks([]);
    setEditingCaseDetail(null);
  };

  const handleEditStep = (index: number) => {
    if (!editingCaseDetail) return;
    const step = editingCaseDetail.steps[index];
    setEditingStepIndex(index);
    setEditStepForm({
      description: step.description,
      expect: step.expect || '',
    });
    setEditStepModalVisible(true);
  };

  const handleSaveEditStep = () => {
    if (!editingCaseDetail || editingStepIndex < 0) return;
    const newSteps = [...editingCaseDetail.steps];
    newSteps[editingStepIndex] = {
      ...newSteps[editingStepIndex],
      description: editStepForm.description,
      expect: editStepForm.expect || undefined,
    };
    setEditingCaseDetail({
      ...editingCaseDetail,
      steps: newSteps,
    });
    setEditStepModalVisible(false);
    setEditingStepIndex(-1);
  };

  const handleDeleteStep = (index: number) => {
    if (!editingCaseDetail) return;
    const newSteps = editingCaseDetail.steps.filter((_, i) => i !== index);
    setEditingCaseDetail({
      ...editingCaseDetail,
      steps: newSteps.map((step, i) => ({
        ...step,
        stepIndex: i + 1,
      })),
    });
  };

  const handleInsertStep = (index: number, direction: 'up' | 'down') => {
    setInsertStepPosition({ index, direction });
    setInsertStepForm({
      description: '',
      expect: '',
    });
    setInsertStepModalVisible(true);
  };

  const handleSaveInsertStep = () => {
    if (!editingCaseDetail) return;
    const newStep: TextCaseStep = {
      id: Date.now(),
      description: insertStepForm.description,
      expect: insertStepForm.expect || undefined,
      stepIndex: 0,
    };
    
    const insertIndex = insertStepPosition.direction === 'up' 
      ? insertStepPosition.index 
      : insertStepPosition.index + 1;
    
    const newSteps = [...editingCaseDetail.steps];
    newSteps.splice(insertIndex, 0, newStep);
    
    setEditingCaseDetail({
      ...editingCaseDetail,
      steps: newSteps.map((step, i) => ({
        ...step,
        stepIndex: i + 1,
      })),
    });
    setInsertStepModalVisible(false);
  };

  const handleSaveEdit = async () => {
    setParsedTasks(editingTasks);
    if (editingCaseDetail) {
      setCaseDetailData(editingCaseDetail);
    }
    
    const yamlContent = yaml.dump({ tasks: editingTasks });
    const caseDetailContent = editingCaseDetail 
      ? JSON.stringify(editingCaseDetail, null, 2) 
      : script?.caseDetail || '';
    
    setIsSyncing(true);
    try {
      const response = await fetch(`${API_BASE_URL}/case/update`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          id: scriptId,
          caseTitle: script?.caseTitle || scriptTitle,
          priority: 1,
          platform: 1,
          appName: '京东',
          caseDetail: caseDetailContent,
          autoCaseDetail: script?.autoCaseDetail || '',
          yamlScript: yamlContent,
          operator: 'system',
        }),
      });

      const result = await response.json();
      
      if (response.ok && result.code === 200) {
        if (script) {
          setScript({
            ...script,
            yamlScript: yamlContent,
            caseDetail: caseDetailContent,
          });
        }
        setIsEditMode(false);
        message.success('保存成功');
      } else {
        message.error(result.message || '同步失败');
      }
    } catch (err) {
      console.error('[ScriptDetail] Sync error:', err);
      message.error('保存失败，请检查网络连接');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleGenerateJsScript = async () => {
    const dataToUse = editingCaseDetail || caseDetailData;
    
    if (!dataToUse || dataToUse.steps.length === 0) {
      message.warning('没有可用的步骤数据，无法生成JS脚本');
      return;
    }

    setIsGeneratingJs(true);
    setGeneratedJsScript('');
    setActiveTab('code');
    
    try {
      const modelConfig = globalModelConfigManager.getModelConfig('default');
      
      const result = await generateJsScriptFromTextCase(
        dataToUse,
        {
          stream: true,
          onChunk: (chunk) => {
            setGeneratedJsScript(chunk.accumulated);
          },
        },
        modelConfig,
      );
      
      setHasUnsavedJsScript(true);
      message.success('JS脚本生成成功，请点击保存按钮采纳');
    } catch (err) {
      console.error('[ScriptDetail] Generate JS script error:', err);
      message.error(`生成失败: ${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setIsGeneratingJs(false);
    }
  };

  const handleSaveJsScript = async () => {
    if (!script || !generatedJsScript) return;
    
    setIsSyncing(true);
    try {
      const response = await fetch(`${API_BASE_URL}/case/update`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          id: scriptId,
          caseTitle: script?.caseTitle || scriptTitle,
          priority: 1,
          platform: 1,
          appName: '京东',
          caseDetail: script?.caseDetail || '',
          autoCaseDetail: generatedJsScript,
          yamlScript: script?.yamlScript || '',
          operator: 'system',
        }),
      });

      const result = await response.json();
      
      if (response.ok && result.code === 200) {
        setScript({
          ...script,
          autoCaseDetail: generatedJsScript,
        });
        setHasUnsavedJsScript(false);
        message.success('JS脚本已保存并同步到平台');
      } else {
        message.error(result.message || '同步失败');
      }
    } catch (err) {
      console.error('[ScriptDetail] Sync error:', err);
      message.error('保存失败，请检查网络连接');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleExecuteScript = async () => {
    console.log('[ScriptDetail] handleExecuteScript called');
    const autoCaseDetail = generatedJsScript || script?.autoCaseDetail;
    console.log('[ScriptDetail] autoCaseDetail:', autoCaseDetail ? autoCaseDetail.substring(0, 200) : 'null');
    console.log('[ScriptDetail] generatedJsScript:', generatedJsScript ? 'exists' : 'null');
    console.log('[ScriptDetail] script?.autoCaseDetail:', script?.autoCaseDetail ? 'exists' : 'null');
    
    if (!autoCaseDetail) {
      message.error('没有可执行的脚本');
      return;
    }

    Modal.confirm({
      title: '确认执行',
      content: (
        <div>
          <p>即将在当前浏览器标签页执行测试脚本。</p>
        </div>
      ),
      okText: '开始执行',
      cancelText: '取消',
      onOk: () => {
        console.log('[ScriptDetail] Modal confirmed, calling doExecute');
        doExecute(autoCaseDetail);
      },
    });
  };

  const handleExecuteStep = async (stepIndex: number) => {
    const autoCaseDetail = generatedJsScript || script?.autoCaseDetail;
    if (!autoCaseDetail) {
      message.error('没有可执行的脚本');
      return;
    }

    doExecute(autoCaseDetail, stepIndex);
  };

  const doExecute = async (autoCaseDetail: string, targetStepId?: number) => {
    setIsExecuting(true);
    setExecutionResult(null);
    setExecutionStepIndex(-1);
    setExecutionStepStatus({});
    setExecutionError(null);

    try {
      const { ChromeExtensionProxyPageAgent, ChromeExtensionProxyPage } = await import('@midscene/web/chrome-extension');
      
      message.loading({ content: '正在连接当前标签页...', key: 'bridge' });

      const page = new ChromeExtensionProxyPage(true);
      
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tabId = tabs[0]?.id;
      
      if (!tabId) {
        message.error({ content: '无法获取当前标签页', key: 'bridge' });
        throw new Error('无法获取当前标签页');
      }

      await page.setActiveTabId(tabId);
      message.success({ content: '连接成功，开始执行', key: 'bridge' });

      const agent = new ChromeExtensionProxyPageAgent(page);

      const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

      const scriptCode = autoCaseDetail;
      
      console.log('[ScriptDetail] Script code length:', scriptCode.length);
      console.log('[ScriptDetail] Script code preview:', scriptCode.substring(0, 500));
      
      interface ParsedStep {
        type: 'step' | 'assert';
        description: string;
        code: string;
        order: number;
        stepId: number;
      }
      
      const parsedSteps: ParsedStep[] = [];
      
      const extractCodeBlock = (str: string, startIndex: number): { code: string; endIndex: number } | null => {
        let braceCount = 1;
        let i = startIndex;
        
        while (i < str.length) {
          const char = str[i];
          if (char === '{') {
            braceCount++;
          } else if (char === '}') {
            braceCount--;
            if (braceCount === 0) {
              return {
                code: str.substring(startIndex, i),
                endIndex: i,
              };
            }
          }
          i++;
        }
        return null;
      };
      
      const stepPattern = /joyTest\.executeStep\s*\(\s*`([^`]+)`\s*,\s*async\s*\(\s*\)\s*=>\s*\{/g;
      let stepMatch;
      let stepCount = 0;
      while ((stepMatch = stepPattern.exec(scriptCode)) !== null) {
        stepCount++;
        const blockStart = stepMatch.index + stepMatch[0].length;
        const blockResult = extractCodeBlock(scriptCode, blockStart);
        if (blockResult) {
          const afterBlock = scriptCode.substring(blockResult.endIndex + 1);
          const stepIdMatch = afterBlock.match(/^\s*,\s*(\d+)\s*\)/);
          const stepId = stepIdMatch ? parseInt(stepIdMatch[1]) : 0;
          parsedSteps.push({
            type: 'step',
            description: stepMatch[1],
            code: blockResult.code.trim(),
            order: stepMatch.index,
            stepId,
          });
        }
      }
      
      const assertPattern = /joyTest\.executeAssert\s*\(\s*`([^`]+)`\s*,\s*(?:`([^`]+)`|'([^']+)'|"([^"]+)")\s*,\s*async\s*\(\s*\)\s*=>\s*\{/g;
      let assertMatch;
      let assertCount = 0;
      while ((assertMatch = assertPattern.exec(scriptCode)) !== null) {
        assertCount++;
        const description = assertMatch[1];
        const blockStart = assertMatch.index + assertMatch[0].length;
        const blockResult = extractCodeBlock(scriptCode, blockStart);
        if (blockResult) {
          const afterBlock = scriptCode.substring(blockResult.endIndex + 1);
          const stepIdMatch = afterBlock.match(/^\s*,\s*(\d+)\s*\)/);
          const stepId = stepIdMatch ? parseInt(stepIdMatch[1]) : 0;
          parsedSteps.push({
            type: 'assert',
            description: description,
            code: blockResult.code.trim(),
            order: assertMatch.index,
            stepId,
          });
        }
      }
      
      parsedSteps.sort((a, b) => a.order - b.order);
      
      if (parsedSteps.length === 0) {
        message.warning('没有可执行的步骤');
        return;
      }

      if (targetStepId !== undefined) {
        const matchingSteps = parsedSteps.filter(s => s.stepId === targetStepId);
        if (matchingSteps.length === 0) {
          message.warning(`没有找到 stepId 为 ${targetStepId} 的步骤`);
          setIsExecuting(false);
          return;
        }
      }

      const executeCode = async (code: string) => {
          console.log('[ScriptDetail] executeCode called with:', code);
          const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
          
          const executeSingleMethod = async (methodCode: string) => {
            console.log('[ScriptDetail] executeSingleMethod called with:', methodCode);
            const aiTapMatch = methodCode.match(/await agent\.aiTap\s*\(\s*`([^`]+)`/);
            if (aiTapMatch) {
              console.log('[ScriptDetail] aiTap matched:', aiTapMatch[1]);
              const deepThink = methodCode.includes('deepThink: true');
              await agent.aiTap(aiTapMatch[1], deepThink ? { deepThink: true } : undefined);
              return true;
            }
          
          const aiInputObjectMatch = methodCode.match(/await agent\.aiInput\s*\(\s*`([^`]+)`\s*,\s*\{\s*value\s*:\s*["'`]([^"'`]+)["'`]\s*\}/);
          if (aiInputObjectMatch) {
            const deepThink = methodCode.includes('deepThink: true');
            await agent.aiInput(aiInputObjectMatch[1], { value: aiInputObjectMatch[2], ...(deepThink ? { deepThink: true } : {}) });
            return true;
          }
          
          const aiKeyboardPressMatch = methodCode.match(/await agent\.aiKeyboardPress\s*\(\s*`([^`]+)`\s*,\s*\{\s*keyName\s*:\s*`([^`]+)`\s*\}/);
          if (aiKeyboardPressMatch) {
            await agent.aiKeyboardPress(aiKeyboardPressMatch[1], { keyName: aiKeyboardPressMatch[2] });
            return true;
          }
          
          const aiScrollMatch = methodCode.match(/await agent\.aiScroll\s*\(\s*`([^`]+)`\s*,\s*\{\s*direction\s*:\s*["'`]([^"'`]+)["'`]\s*,\s*distance\s*:\s*(\d+)\s*\}/);
          if (aiScrollMatch) {
            await agent.aiScroll(aiScrollMatch[1], { direction: aiScrollMatch[2] as 'up' | 'down', distance: parseInt(aiScrollMatch[3]) });
            return true;
          }
          
          const aiAssertMatch = methodCode.match(/await agent\.aiAssert\s*\(\s*`([^`]+)`\s*,\s*`([^`]+)`/);
          if (aiAssertMatch) {
            await agent.aiAssert(aiAssertMatch[1], aiAssertMatch[2]);
            return true;
          }
          
          const aiWaitForMatch = methodCode.match(/await agent\.aiWaitFor\s*\(\s*`([^`]+)`/);
          if (aiWaitForMatch) {
            await agent.aiWaitFor(aiWaitForMatch[1]);
            return true;
          }
          
          const aiActMatch = methodCode.match(/await agent\.aiAct\s*\(\s*`([^`]+)`\s*\)/);
          if (aiActMatch) {
            console.log('[ScriptDetail] aiAct matched:', aiActMatch[1]);
            await agent.aiAct(aiActMatch[1]);
            return true;
          }
          
          const sleepMatch = methodCode.match(/await sleep\s*\(\s*(\d+)\s*\)/);
          if (sleepMatch) {
            await sleep(parseInt(sleepMatch[1]));
            return true;
          }
          
          return false;
        };
        
        const aiBooleanMatch = code.match(/const\s+(\w+)\s*=\s*await agent\.aiBoolean\s*\(\s*`([^`]+)`/);
        if (aiBooleanMatch) {
          const result = await agent.aiBoolean(aiBooleanMatch[2]);
          const ifMatch = code.match(/if\s*\(\s*!?\s*\w+\s*\)\s*\{([\s\S]*?)\}/);
          if (ifMatch) {
            const innerCode = ifMatch[1].trim();
            const conditionVar = aiBooleanMatch[1];
            const isNegated = ifMatch[0].includes('!');
            const shouldExecute = isNegated ? !result : result;
            if (shouldExecute) {
              await executeSingleMethod(innerCode);
            }
          }
          return;
        }
        
        const methodPattern = /await\s+(?:agent\.(?:aiTap|aiInput|aiKeyboardPress|aiScroll|aiAssert|aiWaitFor|aiAct)|sleep)\s*\([^;]+\);?/g;
        const methodCalls = code.match(methodPattern) || [];
        
        if (methodCalls.length > 0) {
          for (const methodCall of methodCalls) {
            await executeSingleMethod(methodCall);
          }
        } else {
          await agent.aiAct(code);
        }
      };

      for (let i = 0; i < parsedSteps.length; i++) {
        const step = parsedSteps[i];
        
        if (targetStepId !== undefined && step.stepId !== targetStepId) {
          continue;
        }
        
        const stepIndex = caseDetailToRender?.steps.findIndex(s => s.id === step.stepId) ?? i;
        setExecutionStepIndex(stepIndex);
        setExecutionStepStatus(prev => ({ ...prev, [stepIndex]: 'running' }));

        try {
          await executeCode(step.code);
          setExecutionStepStatus(prev => ({ ...prev, [stepIndex]: 'success' }));
          
          if (targetStepId !== undefined && step.type === 'step') {
            await sleep(1000);
            
            const nextStep = parsedSteps[i + 1];
            if (nextStep && nextStep.type === 'assert' && nextStep.stepId === step.stepId) {
              const assertStepIndex = caseDetailToRender?.steps.findIndex(s => s.id === nextStep.stepId) ?? i + 1;
              setExecutionStepIndex(assertStepIndex);
              setExecutionStepStatus(prev => ({ ...prev, [assertStepIndex]: 'running' }));
              
              try {
                await executeCode(nextStep.code);
                setExecutionStepStatus(prev => ({ ...prev, [assertStepIndex]: 'success' }));
              } catch (assertError) {
                setExecutionStepStatus(prev => ({ ...prev, [assertStepIndex]: 'failed' }));
                throw assertError;
              }
            }
            
            triggerConfetti();
          }
        } catch (error) {
          setExecutionStepStatus(prev => ({ ...prev, [stepIndex]: 'failed' }));
          const errorMsg = `步骤 ${stepIndex + 1} 执行失败: ${error instanceof Error ? error.message : '未知错误'}`;
          setExecutionError(errorMsg);
          throw error;
        }

        await sleep(2000);
        
        if (targetStepId !== undefined) {
          break;
        }
      }

      if (targetStepId === undefined) {
        setExecutionResult('success');
        triggerConfetti();
      }
      message.success('执行完成');
      await page.destroy();
    } catch (err) {
      console.error('[ScriptDetail] Execution error:', err);
      setExecutionResult('failed');
    } finally {
      setIsExecuting(false);
    }
  };

  const handleEditFlowItem = (taskIndex: number, flowIndex: number) => {
    const item = editingTasks[taskIndex].flow[flowIndex];
    let actionType: FlowActionType = 'aiTap';
    let value = '';
    let locate = '';

    if (item.aiTap) {
      actionType = 'aiTap';
      value = item.aiTap;
    } else if (item.aiInput) {
      actionType = 'aiInput';
      value = item.aiInput;
      locate = item.locate || '';
    } else if (item.aiAssert) {
      actionType = 'aiAssert';
      value = item.aiAssert;
    } else if (item.aiAct) {
      actionType = 'aiAct';
      value = item.aiAct;
    } else if (item.aiWaitFor) {
      actionType = 'aiWaitFor';
      value = item.aiWaitFor;
    } else if (item.sleep !== undefined) {
      actionType = 'sleep';
      value = String(item.sleep);
    }

    setEditingFlowItem({ taskIndex, flowIndex, item });
    setEditForm({
      actionType,
      value,
      locate,
      deepThink: item.deepThink || false,
    });
    setEditModalVisible(true);
  };

  const handleSaveEditFlowItem = () => {
    if (!editingFlowItem) return;

    const { taskIndex, flowIndex } = editingFlowItem;
    const newFlowItem: ScriptFlowItem = {
      deepThink: editForm.deepThink,
    };

    switch (editForm.actionType) {
      case 'aiTap':
        newFlowItem.aiTap = editForm.value;
        break;
      case 'aiInput':
        newFlowItem.aiInput = editForm.value;
        if (editForm.locate) newFlowItem.locate = editForm.locate;
        break;
      case 'aiAssert':
        newFlowItem.aiAssert = editForm.value;
        break;
      case 'aiAct':
        newFlowItem.aiAct = editForm.value;
        break;
      case 'aiWaitFor':
        newFlowItem.aiWaitFor = editForm.value;
        break;
      case 'sleep':
        newFlowItem.sleep = parseInt(editForm.value) || 1000;
        break;
    }

    const newTasks = [...editingTasks];
    newTasks[taskIndex].flow[flowIndex] = newFlowItem;
    setEditingTasks(newTasks);
    setEditModalVisible(false);
    setEditingFlowItem(null);
  };

  const handleDeleteFlowItem = (taskIndex: number, flowIndex: number) => {
    const newTasks = [...editingTasks];
    newTasks[taskIndex].flow.splice(flowIndex, 1);
    setEditingTasks(newTasks);
    
    if (editingCaseDetail) {
      const newCaseDetail = { ...editingCaseDetail };
      const stepIndexToRemove = newTasks.slice(0, taskIndex).reduce((acc, t) => acc + t.flow.length, 0) + flowIndex;
      newCaseDetail.steps = newCaseDetail.steps.filter((_, i) => i !== stepIndexToRemove);
      setEditingCaseDetail(newCaseDetail);
    }
  };

  const handleInsertFlowItem = (taskIndex: number, flowIndex: number, direction: 'up' | 'down') => {
    setInsertPosition({ taskIndex, flowIndex, direction });
    setInsertForm({
      actionType: 'aiTap',
      value: '',
      locate: '',
      deepThink: false,
    });
    setInsertModalVisible(true);
  };

  const handleSaveInsertFlowItem = () => {
    const newFlowItem: ScriptFlowItem = {
      deepThink: insertForm.deepThink,
    };

    switch (insertForm.actionType) {
      case 'aiTap':
        newFlowItem.aiTap = insertForm.value;
        break;
      case 'aiInput':
        newFlowItem.aiInput = insertForm.value;
        if (insertForm.locate) newFlowItem.locate = insertForm.locate;
        break;
      case 'aiAssert':
        newFlowItem.aiAssert = insertForm.value;
        break;
      case 'aiAct':
        newFlowItem.aiAct = insertForm.value;
        break;
      case 'aiWaitFor':
        newFlowItem.aiWaitFor = insertForm.value;
        break;
      case 'sleep':
        newFlowItem.sleep = parseInt(insertForm.value) || 1000;
        break;
    }

    const insertIndex = insertPosition.direction === 'up' 
      ? insertPosition.flowIndex 
      : insertPosition.flowIndex + 1;

    const newTasks = [...editingTasks];
    newTasks[insertPosition.taskIndex].flow.splice(insertIndex, 0, newFlowItem);
    setEditingTasks(newTasks);
    setInsertModalVisible(false);
  };

  const handleAddFlowItemToEnd = (taskIndex: number) => {
    const flowLength = editingTasks[taskIndex].flow.length;
    setInsertPosition({ taskIndex, flowIndex: flowLength - 1, direction: 'down' });
    setInsertForm({
      actionType: 'aiTap',
      value: '',
      locate: '',
      deepThink: false,
    });
    setInsertModalVisible(true);
  };

  const handleAddTask = () => {
    const newTask: ScriptTask = {
      name: `新任务 ${(editingTasks.length + 1)}`,
      stepId: Date.now(),
      flow: [],
    };
    setEditingTasks([...editingTasks, newTask]);
  };

  const handleDeleteTask = (taskIndex: number) => {
    const newTasks = editingTasks.filter((_, i) => i !== taskIndex);
    setEditingTasks(newTasks);
  };

  const handleEditTaskName = (taskIndex: number, name: string) => {
    const newTasks = [...editingTasks];
    newTasks[taskIndex].name = name;
    setEditingTasks(newTasks);
  };

  const handleSyncToDonggui = async () => {
    if (!script) return;
    
    setIsSyncing(true);
    try {
      const yamlContent = yaml.dump({ tasks: editingTasks });
      const caseDetailContent = editingCaseDetail 
        ? JSON.stringify(editingCaseDetail, null, 2) 
        : script.caseDetail || '';
      const autoCaseDetailContent = generatedJsScript || script.autoCaseDetail || '';
      
      const response = await fetch(`${API_BASE_URL}/case/update`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          id: scriptId,
          caseTitle: script.caseTitle,
          priority: 1,
          platform: 1,
          appName: '京东',
          caseDetail: caseDetailContent,
          autoCaseDetail: autoCaseDetailContent,
          yamlScript: yamlContent,
          operator: 'system',
        }),
      });

      const result = await response.json();
      
      if (response.ok && result.code === 200) {
        message.success('同步到 DongGUI 平台成功');
        setScript({
          ...script,
          yamlScript: yamlContent,
          caseDetail: caseDetailContent,
          autoCaseDetail: autoCaseDetailContent,
        });
      } else {
        message.error(result.message || '同步失败');
      }
    } catch (err) {
      console.error('[ScriptDetail] Sync error:', err);
      message.error('同步失败，请检查网络连接');
    } finally {
      setIsSyncing(false);
    }
  };

  const renderFlowItem = useCallback((flowItem: ScriptFlowItem, index: number, taskIndex: number) => {
    const flowType = getFlowItemType(flowItem);

    if (isEditMode) {
      return (
        <div 
          key={index} 
          className="flow-item edit-mode"
        >
          <div className="flow-item-content">
            <Tag color={flowType === '断言' ? 'green' : 'blue'} className="flow-type-tag">
              {flowType}
            </Tag>
            <Text className="flow-action">{getFlowItemDescription(flowItem)}</Text>
            {flowItem.deepThink && (
              <Tag color="purple" className="deep-think-tag">深度思考</Tag>
            )}
          </div>
          <div className="flow-item-actions">
            <Button 
              type="text" 
              size="small" 
              icon={<UpOutlined />}
              onClick={() => handleInsertFlowItem(taskIndex, index, 'up')}
              title="向上插入步骤"
            />
            <Button 
              type="text" 
              size="small" 
              icon={<DownOutlined />}
              onClick={() => handleInsertFlowItem(taskIndex, index, 'down')}
              title="向下插入步骤"
            />
            <Button 
              type="text" 
              size="small" 
              icon={<EditOutlined />}
              onClick={() => handleEditFlowItem(taskIndex, index)}
              title="编辑步骤"
            />
            <Popconfirm
              title="确定删除此步骤？"
              onConfirm={() => handleDeleteFlowItem(taskIndex, index)}
              okText="确定"
              cancelText="取消"
            >
              <Button 
                type="text" 
                size="small" 
                danger
                icon={<DeleteOutlined />}
                title="删除步骤"
              />
            </Popconfirm>
          </div>
        </div>
      );
    }

    return (
      <div 
        key={index} 
        className="flow-item"
      >
        <div className="flow-item-header">
          <span className="flow-index">{index + 1}</span>
          <Tag color={flowType === '断言' ? 'green' : 'blue'} className="flow-type-tag">
            {flowType}
          </Tag>
          <Text className="flow-action">{getFlowItemDescription(flowItem)}</Text>
        </div>
        {flowItem.deepThink && (
          <Tag color="purple" className="deep-think-tag">深度思考</Tag>
        )}
      </div>
    );
  }, [isEditMode, editingTasks]);

  const renderTask = (task: ScriptTask, taskIndex: number) => {
    return (
      <div key={taskIndex} className="task-card">
        <div className="task-card-header">
          {isEditMode ? (
            <Input
              value={task.name}
              onChange={(e) => handleEditTaskName(taskIndex, e.target.value)}
              className="task-name-input"
            />
          ) : (
            <span className="task-name">{task.name}</span>
          )}
          <div className="task-actions">
            {task.continueOnError && (
              <Tag color="orange" className="continue-tag">出错继续</Tag>
            )}
            {isEditMode && (
              <>
                <Button 
                  type="primary"
                  size="small"
                  icon={<PlusOutlined />}
                  onClick={() => handleAddFlowItemToEnd(taskIndex)}
                >
                  添加步骤
                </Button>
                <Popconfirm
                  title="确定删除此任务？"
                  onConfirm={() => handleDeleteTask(taskIndex)}
                  okText="确定"
                  cancelText="取消"
                >
                  <Button 
                    type="text" 
                    size="small" 
                    danger
                    icon={<DeleteOutlined />}
                  />
                </Popconfirm>
              </>
            )}
          </div>
        </div>
        <div className="task-card-content">
          {task.flow.length === 0 ? (
            <Empty description="暂无步骤" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : (
            task.flow.map((flowItem, index) => renderFlowItem(flowItem, index, taskIndex))
          )}
        </div>
      </div>
    );
  };

  const renderCaseDetailStep = (step: { id: number; description: string; expect?: string }, index: number) => {
    return (
      <div key={index} className="case-detail-step-item">
        <div className="step-header">
          <span className="step-index">{index + 1}</span>
          <Tag color="blue" className="step-type-tag">步骤</Tag>
          <Text className="step-description">{step.description}</Text>
        </div>
        {step.expect && (
          <div className="step-expect">
            <Tag color="green">预期: {step.expect}</Tag>
          </div>
        )}
      </div>
    );
  };

  const renderParsedStep = (step: ParsedStep, index: number) => {
    return (
      <div key={index} className="parsed-step-item">
        <div className="step-header">
          <span className="step-index">{index + 1}</span>
          <Tag color={step.type === 'assert' ? 'green' : 'blue'} className="step-type-tag">
            {step.type === 'assert' ? '断言' : '步骤'}
          </Tag>
          <Text className="step-description">{step.description}</Text>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="script-detail-container loading">
        <Spin tip="加载中..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="script-detail-container error">
        <Empty description={error} />
        <Button onClick={onBack}>返回</Button>
      </div>
    );
  }

  if (!script) {
    return (
      <div className="script-detail-container empty">
        <Empty description="脚本不存在" />
        <Button onClick={onBack}>返回</Button>
      </div>
    );
  }

  const tasksToRender = isEditMode ? editingTasks : parsedTasks;
  const caseDetailToRender = isEditMode ? editingCaseDetail : caseDetailData;

  const tabItems = [
    {
      key: 'steps',
      label: (
        <span>
          <UnorderedListOutlined />
          步骤视图
        </span>
      ),
      children: (
        <div className="tab-content">
          {caseDetailToRender && caseDetailToRender.steps.length > 0 ? (
            <div className="steps-list">
              {caseDetailToRender.steps.map((step, index) => {
                const stepStatus = executionStepStatus[index];
                const isCurrentStep = executionStepIndex === index;
                return (
                  <div 
                    key={index} 
                    className={`step-item ${stepStatus || ''} ${isCurrentStep ? 'current' : ''}`}
                  >
                    <div className="step-number">
                      {stepStatus === 'running' ? (
                        <LoadingOutlined spin />
                      ) : stepStatus === 'success' ? (
                        <CheckCircleOutlined />
                      ) : stepStatus === 'failed' ? (
                        <CloseCircleOutlined />
                      ) : (
                        index + 1
                      )}
                    </div>
                    <div className="step-content">
                      <div className="step-description">{step.description}</div>
                      {step.expect && (
                        <div className="step-expect">
                          <span className="expect-label">预期：</span>
                          <span className="expect-value">{step.expect}</span>
                        </div>
                      )}
                    </div>
                    {isEditMode && (
                      <div className="step-actions">
                        <Tooltip title="向上插入步骤" mouseEnterDelay={0}>
                          <Button 
                            type="text" 
                            size="small" 
                            icon={<UpOutlined />}
                            onClick={() => handleInsertStep(index, 'up')}
                          />
                        </Tooltip>
                        <Tooltip title="向下插入步骤" mouseEnterDelay={0}>
                          <Button 
                            type="text" 
                            size="small" 
                            icon={<DownOutlined />}
                            onClick={() => handleInsertStep(index, 'down')}
                          />
                        </Tooltip>
                        <Tooltip title="编辑步骤">
                          <Button 
                            type="text" 
                            size="small" 
                            icon={<EditOutlined />}
                            onClick={() => handleEditStep(index)}
                          />
                        </Tooltip>
                        <Popconfirm
                          title="确定删除此步骤？"
                          onConfirm={() => handleDeleteStep(index)}
                          okText="确定"
                          cancelText="取消"
                        >
                          <Button 
                            type="text" 
                            size="small" 
                            danger
                            icon={<DeleteOutlined />}
                          />
                        </Popconfirm>
                      </div>
                    )}
                    {!isEditMode && (
                      <div className="step-actions">
                        <Tooltip title={isExecuting ? "执行中..." : "执行此步骤"}>
                          <Button 
                            type="text" 
                            size="small" 
                            icon={isExecuting && executionStepIndex === index ? <LoadingOutlined /> : <PlayCircleOutlined />}
                            onClick={() => handleExecuteStep(step.id || step.stepIndex || index + 1)}
                            disabled={isExecuting}
                          />
                        </Tooltip>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <Empty description="暂无执行步骤" />
          )}
          {executionResult === 'failed' && executionError && (
            <div className="execution-result">
              <Card 
                size="small" 
                className="execution-error-card"
                title={
                  <span style={{ color: '#ff4d4f' }}>
                    <CloseCircleOutlined style={{ marginRight: 8 }} />
                    执行失败
                  </span>
                }
              >
                <div className="execution-error-content">
                  {executionError}
                </div>
              </Card>
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'code',
      label: (
        <span>
          <CodeOutlined />
          JS脚本
        </span>
      ),
      children: (
        <div className="tab-content">
          <Card size="small" className="code-view-card">
            {isGeneratingJs ? (
              <div className="code-generating">
                <LoadingOutlined spin />
                <Text>正在生成JS脚本...</Text>
              </div>
            ) : null}
            <pre className="code-preview">
              <code>{generatedJsScript || script.autoCaseDetail || '// 暂无脚本内容，请点击"生成JS脚本"按钮生成'}</code>
            </pre>
          </Card>
        </div>
      ),
    },
  ];

  return (
    <div className="script-detail-container">
      <div className="script-detail-header">
        <Button 
          type="text" 
          icon={<ArrowLeftOutlined />} 
          onClick={onBack}
        >
          返回
        </Button>
        <h3 className="script-title">{script.caseTitle || scriptTitle}</h3>
        <div className="header-actions">
          <Tooltip title="生成JS脚本">
            <Button 
              icon={<StarIcon />}
              onClick={handleGenerateJsScript}
              loading={isGeneratingJs}
              className="star-btn"
            />
          </Tooltip>
          {hasUnsavedJsScript && generatedJsScript && (
            <Tooltip title="保存JS脚本">
              <Button 
                icon={<SaveOutlined />}
                onClick={handleSaveJsScript}
                className="save-js-btn"
              />
            </Tooltip>
          )}
          {isEditMode ? (
            <>
              <Tooltip title="取消">
                <Button 
                  icon={<CloseOutlined />}
                  onClick={handleCancelEdit}
                />
              </Tooltip>
              <Tooltip title="保存">
                <Button 
                  type="primary" 
                  icon={<SaveOutlined />}
                  onClick={handleSaveEdit}
                  loading={isSyncing}
                />
              </Tooltip>
            </>
          ) : (
            <>
              <Tooltip title={isExecuting ? "执行中..." : "执行全部步骤"}>
                <Button 
                  type="primary"
                  icon={isExecuting ? <LoadingOutlined /> : <PlayCircleOutlined />}
                  onClick={() => doExecute(generatedJsScript || script?.autoCaseDetail || '')}
                  disabled={isExecuting}
                >
                  {isExecuting ? '执行中' : '执行全部'}
                </Button>
              </Tooltip>
              <Tooltip title="编辑">
                <Button 
                  icon={<EditOutlined />}
                  onClick={handleEnterEditMode}
                  disabled={isExecuting}
                />
              </Tooltip>
            </>
          )}
        </div>
      </div>

      <div className="script-detail-content">
        <Tabs 
          activeKey={activeTab} 
          onChange={(key) => setActiveTab(key as 'steps' | 'code')}
          items={tabItems}
          className="script-tabs"
        />
      </div>

      <Modal
        title="编辑步骤"
        open={editModalVisible}
        onOk={handleSaveEditFlowItem}
        onCancel={() => setEditModalVisible(false)}
        okText="保存"
        cancelText="取消"
      >
        <div className="edit-form">
          <div className="form-item">
            <label>操作类型：</label>
            <Select
              value={editForm.actionType}
              onChange={(value) => setEditForm({ ...editForm, actionType: value })}
              style={{ width: '100%' }}
            >
              {FLOW_ACTION_CONFIGS.map(config => (
                <Option key={config.type} value={config.type}>{config.label}</Option>
              ))}
            </Select>
          </div>
          {FLOW_ACTION_CONFIGS.find(c => c.type === editForm.actionType)?.needsLocate && (
            <div className="form-item">
              <label>定位元素：</label>
              <Input
                value={editForm.locate}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditForm({ ...editForm, locate: e.target.value })}
                placeholder="请输入元素定位描述"
              />
            </div>
          )}
          <div className="form-item">
            <label>内容：</label>
            <TextArea
              value={editForm.value}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setEditForm({ ...editForm, value: e.target.value })}
              placeholder={FLOW_ACTION_CONFIGS.find(c => c.type === editForm.actionType)?.placeholder}
              rows={3}
            />
          </div>
          <div className="form-item">
            <label>
              <input
                type="checkbox"
                checked={editForm.deepThink}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditForm({ ...editForm, deepThink: e.target.checked })}
                style={{ marginRight: 8 }}
              />
              启用深度思考
            </label>
          </div>
        </div>
      </Modal>

      <Modal
        title={insertPosition.direction === 'up' ? '向上插入步骤' : '向下插入步骤'}
        open={insertModalVisible}
        onOk={handleSaveInsertFlowItem}
        onCancel={() => setInsertModalVisible(false)}
        okText="插入"
        cancelText="取消"
      >
        <div className="edit-form">
          <div className="form-item">
            <label>操作类型：</label>
            <Select
              value={insertForm.actionType}
              onChange={(value) => setInsertForm({ ...insertForm, actionType: value })}
              style={{ width: '100%' }}
            >
              {FLOW_ACTION_CONFIGS.map(config => (
                <Option key={config.type} value={config.type}>{config.label}</Option>
              ))}
            </Select>
          </div>
          {FLOW_ACTION_CONFIGS.find(c => c.type === insertForm.actionType)?.needsLocate && (
            <div className="form-item">
              <label>定位元素：</label>
              <Input
                value={insertForm.locate}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInsertForm({ ...insertForm, locate: e.target.value })}
                placeholder="请输入元素定位描述"
              />
            </div>
          )}
          <div className="form-item">
            <label>内容：</label>
            <TextArea
              value={insertForm.value}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setInsertForm({ ...insertForm, value: e.target.value })}
              placeholder={FLOW_ACTION_CONFIGS.find(c => c.type === insertForm.actionType)?.placeholder}
              rows={3}
            />
          </div>
          <div className="form-item">
            <label>
              <input
                type="checkbox"
                checked={insertForm.deepThink}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInsertForm({ ...insertForm, deepThink: e.target.checked })}
                style={{ marginRight: 8 }}
              />
              启用深度思考
            </label>
          </div>
        </div>
      </Modal>

      <Modal
        title="编辑步骤"
        open={editStepModalVisible}
        onOk={handleSaveEditStep}
        onCancel={() => setEditStepModalVisible(false)}
        okText="保存"
        cancelText="取消"
      >
        <div className="edit-form">
          <div className="form-item">
            <label>步骤描述：</label>
            <TextArea
              value={editStepForm.description}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setEditStepForm({ ...editStepForm, description: e.target.value })}
              placeholder="请输入步骤描述"
              rows={3}
            />
          </div>
          <div className="form-item">
            <label>预期结果：</label>
            <TextArea
              value={editStepForm.expect}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setEditStepForm({ ...editStepForm, expect: e.target.value })}
              placeholder="请输入预期结果（可选）"
              rows={2}
            />
          </div>
        </div>
      </Modal>

      <Modal
        title={insertStepPosition.direction === 'up' ? '向上插入步骤' : '向下插入步骤'}
        open={insertStepModalVisible}
        onOk={handleSaveInsertStep}
        onCancel={() => setInsertStepModalVisible(false)}
        okText="插入"
        cancelText="取消"
      >
        <div className="edit-form">
          <div className="form-item">
            <label>步骤描述：</label>
            <TextArea
              value={insertStepForm.description}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setInsertStepForm({ ...insertStepForm, description: e.target.value })}
              placeholder="请输入步骤描述"
              rows={3}
            />
          </div>
          <div className="form-item">
            <label>预期结果：</label>
            <TextArea
              value={insertStepForm.expect}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setInsertStepForm({ ...insertStepForm, expect: e.target.value })}
              placeholder="请输入预期结果（可选）"
              rows={2}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
