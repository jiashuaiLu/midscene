import { Button, Card, Empty, Spin, Tag, message, Typography, Steps, Result } from 'antd';
import { 
  ArrowLeftOutlined, 
  PlayCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  LoadingOutlined,
  PauseCircleOutlined,
} from '@ant-design/icons';
import { useEffect, useState, useCallback } from 'react';
import type { ScriptDetail } from '../types';
import { fetchScriptDetail } from '../api';
import './ScriptExecution.less';

const { Text, Title } = Typography;

interface ExecutionStep {
  id: number;
  description: string;
  type: 'step' | 'assert';
  status: 'pending' | 'running' | 'success' | 'failed';
  error?: string;
}

interface ScriptExecutionProps {
  scriptId: number;
  scriptTitle: string;
  onBack: () => void;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function ScriptExecution({
  scriptId,
  scriptTitle,
  onBack,
}: ScriptExecutionProps) {
  const [script, setScript] = useState<ScriptDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [executionSteps, setExecutionSteps] = useState<ExecutionStep[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(-1);
  const [executionResult, setExecutionResult] = useState<'success' | 'failed' | null>(null);

  const loadScriptDetail = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchScriptDetail(scriptId);

      if (response.code === 200 && response.data) {
        setScript(response.data);
        parseScript(response.data.autoCaseDetail);
      } else {
        setError(response.message || 'Failed to load script detail');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load script detail');
      console.error('[ScriptExecution] Error loading script detail:', err);
    } finally {
      setLoading(false);
    }
  };

  const parseScript = (autoCaseDetail: string) => {
    const steps: ExecutionStep[] = [];
    
    const stepRegex = /await joyTest\.executeStep\(\s*["'`]([^"'`]+)["'`]\s*,\s*async\s*\(\)\s*=>\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\},\s*(\d+)\s*\)/g;
    const assertRegex = /await joyTest\.executeAssert\(\s*["'`]([^"'`]+)["'`]\s*,\s*["'`]([^"'`]+)["'`]\s*,\s*async\s*\(\)\s*=>\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\},\s*(\d+)\s*\)/g;
    
    let match;
    
    while ((match = stepRegex.exec(autoCaseDetail)) !== null) {
      steps.push({
        id: parseInt(match[3]),
        description: match[1],
        type: 'step',
        status: 'pending',
      });
    }
    
    while ((match = assertRegex.exec(autoCaseDetail)) !== null) {
      steps.push({
        id: parseInt(match[4]),
        description: `${match[1]}`,
        type: 'assert',
        status: 'pending',
      });
    }
    
    steps.sort((a, b) => a.id - b.id);
    setExecutionSteps(steps);
  };

  const updateStepStatus = (index: number, status: ExecutionStep['status'], error?: string) => {
    setExecutionSteps(prev => {
      const newSteps = [...prev];
      if (newSteps[index]) {
        newSteps[index] = { ...newSteps[index], status, error };
      }
      return newSteps;
    });
  };

  const executeScript = async () => {
    if (!script?.autoCaseDetail) {
      message.error('没有可执行的脚本');
      return;
    }

    setIsExecuting(true);
    setExecutionResult(null);
    setCurrentStepIndex(-1);

    try {
      const { AgentOverChromeBridge } = await import('@midscene/web/bridge-mode');
      
      const agent = new AgentOverChromeBridge({
        printActionDetail: true,
      });

      message.loading({ content: '正在连接浏览器...', key: 'connect' });
      
      try {
        await agent.connectCurrentTab();
        message.success({ content: '连接成功', key: 'connect' });
      } catch (connectError) {
        message.error({ content: '连接失败，请确保浏览器已安装扩展并开启桥接模式', key: 'connect' });
        throw connectError;
      }

      const JoyTest = class {
        private executionId: number;
        private stopOnStepFailure: number;
        private stepResults: Map<number, { success: boolean; error?: string }> = new Map();
        private currentStepIndex: number = -1;
        private onStepStart: (index: number, description: string) => void;
        private onStepEnd: (index: number, success: boolean, error?: string) => void;

        constructor(
          page: any,
          agent: any,
          platform: any,
          params: { executionId?: number; stopOnStepFailure?: number; deviceId?: string },
          callbacks: {
            onStepStart: (index: number, description: string) => void;
            onStepEnd: (index: number, success: boolean, error?: string) => void;
          }
        ) {
          this.executionId = params.executionId ?? 1;
          this.stopOnStepFailure = params.stopOnStepFailure ?? 1;
          this.onStepStart = callbacks.onStepStart;
          this.onStepEnd = callbacks.onStepEnd;
        }

        async preTest() {
          console.log('[JoyTest] Pre-test started');
        }

        async postTest() {
          console.log('[JoyTest] Post-test completed');
        }

        async runTest(testFn: () => Promise<void>) {
          await testFn();
        }

        async executeStep(description: string, action: () => Promise<void>, stepId: number) {
          this.currentStepIndex++;
          this.onStepStart(this.currentStepIndex, description);
          
          try {
            await action();
            this.stepResults.set(stepId, { success: true });
            this.onStepEnd(this.currentStepIndex, true);
          } catch (error) {
            this.stepResults.set(stepId, { success: false, error: String(error) });
            this.onStepEnd(this.currentStepIndex, false, String(error));
            throw error;
          }
        }

        async executeAssert(description: string, assertType: string, assertFn: () => Promise<boolean>, stepId: number) {
          this.currentStepIndex++;
          this.onStepStart(this.currentStepIndex, `断言: ${description}`);
          
          try {
            await assertFn();
            this.stepResults.set(stepId, { success: true });
            this.onStepEnd(this.currentStepIndex, true);
          } catch (error) {
            this.stepResults.set(stepId, { success: false, error: String(error) });
            this.onStepEnd(this.currentStepIndex, false, String(error));
            throw error;
          }
        }
      };

      let stepIndex = -1;
      
      const joyTest = new JoyTest(
        null,
        agent,
        null,
        { executionId: 1, stopOnStepFailure: 1 },
        {
          onStepStart: (index: number, description: string) => {
            stepIndex = index;
            setCurrentStepIndex(index);
            updateStepStatus(index, 'running');
          },
          onStepEnd: (index: number, success: boolean, error?: string) => {
            updateStepStatus(index, success ? 'success' : 'failed', error);
          },
        }
      );

      const scriptCode = script.autoCaseDetail;
      
      const executableCode = `
        (async () => {
          const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
          ${scriptCode
            .replace(/const joyTest = new JoyTest\([^;]+\);?/, '')
            .replace(/await joyTest\.preTest\(\);?/g, '')
            .replace(/await joyTest\.postTest\(\);?/g, '')
            .replace(/await joyTest\.runTest\(async \(\) => \{/, '')
            .replace(/\}\);?\s*$/, '')
          }
        })()
      `;

      try {
        await eval(executableCode);
        setExecutionResult('success');
        message.success('执行完成');
      } catch (execError) {
        setExecutionResult('failed');
        message.error(`执行失败: ${execError}`);
      }

      await agent.destroy();
    } catch (err) {
      console.error('[ScriptExecution] Execution error:', err);
      setExecutionResult('failed');
      message.error(`执行失败: ${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setIsExecuting(false);
    }
  };

  useEffect(() => {
    loadScriptDetail();
  }, [scriptId]);

  if (loading) {
    return (
      <div className="script-execution-container loading">
        <Spin tip="加载中..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="script-execution-container error">
        <Empty description={error} />
        <Button onClick={onBack}>返回</Button>
      </div>
    );
  }

  if (!script) {
    return (
      <div className="script-execution-container empty">
        <Empty description="脚本不存在" />
        <Button onClick={onBack}>返回</Button>
      </div>
    );
  }

  return (
    <div className="script-execution-container">
      <div className="execution-header">
        <Button 
          type="text" 
          icon={<ArrowLeftOutlined />} 
          onClick={onBack}
        >
          返回
        </Button>
        <h3 className="script-title">{script.caseTitle || scriptTitle}</h3>
        <div className="header-actions">
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            onClick={executeScript}
            loading={isExecuting}
            disabled={isExecuting || !script.autoCaseDetail}
          >
            {isExecuting ? '执行中...' : '开始执行'}
          </Button>
        </div>
      </div>

      <div className="execution-content">
        <div className="execution-steps">
          <div className="steps-header">
            <span className="steps-title">执行步骤</span>
            <span className="steps-count">{executionSteps.length} 步</span>
          </div>
          
          <div className="steps-list">
            {executionSteps.map((step, index) => (
              <div 
                key={index} 
                className={`step-item ${step.status} ${currentStepIndex === index ? 'current' : ''}`}
              >
                <div className="step-icon">
                  {step.status === 'pending' && <span className="step-number">{index + 1}</span>}
                  {step.status === 'running' && <LoadingOutlined spin />}
                  {step.status === 'success' && <CheckCircleOutlined />}
                  {step.status === 'failed' && <CloseCircleOutlined />}
                </div>
                <div className="step-content">
                  <div className="step-description">
                    <Tag color={step.type === 'assert' ? 'green' : 'blue'}>
                      {step.type === 'assert' ? '断言' : '步骤'}
                    </Tag>
                    {step.description}
                  </div>
                  {step.error && (
                    <div className="step-error">{step.error}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {executionResult && (
          <div className="execution-result">
            {executionResult === 'success' ? (
              <Result
                status="success"
                title="执行成功"
                subTitle="所有步骤已成功执行"
              />
            ) : (
              <Result
                status="error"
                title="执行失败"
                subTitle="部分步骤执行失败，请查看详情"
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
