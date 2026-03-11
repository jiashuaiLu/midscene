import { Card, Tag, Typography, Button, Spin, Empty, List, message, Modal, Input, Popconfirm, Dropdown, Tabs, Tooltip } from 'antd';
import { 
  LoadingOutlined, 
  EditOutlined, 
  PlusOutlined, 
  DeleteOutlined, 
  SaveOutlined, 
  CloseOutlined,
  CheckCircleOutlined,
  FileTextOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  PlusCircleOutlined,
  CodeOutlined,
  UnorderedListOutlined,
  CloudUploadOutlined,
  RightOutlined,
} from '@ant-design/icons';
import { useState, useCallback } from 'react';
import type { TextCase, TextCaseStep } from '../generators/textCaseGenerator';
import { generateJsScriptFromTextCase } from '../generators/textCaseToJsGenerator';
import type { TextCaseData } from '../generators/textCaseToJsGenerator';
import { globalModelConfigManager } from '@midscene/shared/env';
import './TextCaseView.less';

const { Title, Text } = Typography;
const { TextArea } = Input;

const StarIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path 
      d="M6.46176 1.39664C6.65672 0.875293 6.7542 0.614622 6.91268 0.570766C6.96897 0.555187 7.02843 0.555187 7.08472 0.570766C7.2432 0.614622 7.34068 0.875293 7.53564 1.39663C8.1253 2.97341 8.42013 3.7618 8.9368 4.38752C9.13238 4.62438 9.35007 4.84207 9.58692 5.03764C10.2126 5.55432 11.001 5.84915 12.5778 6.43881C13.0992 6.63377 13.3598 6.73125 13.4037 6.88973C13.4193 6.94602 13.4193 7.00548 13.4037 7.06177C13.3598 7.22025 13.0992 7.31773 12.5778 7.51269C11.001 8.10235 10.2126 8.39718 9.58692 8.91386C9.35007 9.10943 9.13238 9.32712 8.9368 9.56397C8.42013 10.1897 8.1253 10.9781 7.53564 12.5549C7.34068 13.0762 7.2432 13.3369 7.08472 13.3807C7.02843 13.3963 6.96897 13.3963 6.91268 13.3807C6.7542 13.3369 6.65672 13.0762 6.46176 12.5549C5.8721 10.9781 5.57727 10.1897 5.06059 9.56397C4.86501 9.32712 4.64733 9.10943 4.41047 8.91386C3.78475 8.39718 2.99636 8.10235 1.41958 7.51269C0.898242 7.31773 0.637572 7.22025 0.593715 7.06177C0.578137 7.00548 0.578137 6.94602 0.593715 6.88973C0.637572 6.73125 0.898242 6.63377 1.41958 6.43881C2.99636 5.84915 3.78475 5.55432 4.41047 5.03764C4.64733 4.84207 4.86501 4.62438 5.06059 4.38752C5.57727 3.7618 5.8721 2.97341 6.46176 1.39664Z" 
      fill="currentColor"
    />
  </svg>
);

interface TextCaseViewProps {
  textCase: TextCase | null;
  loading?: boolean;
  isStreaming?: boolean;
  streamingContent?: string;
  onTextCaseChange?: (textCase: TextCase) => void;
  onJsScriptGenerated?: (jsScript: string) => void;
  jsScript?: string;
  onSync?: () => Promise<{ success: boolean; caseId?: number; cancelled?: boolean }>;
  onNavigateToDetail?: (caseId: number) => void;
  syncedCaseId?: number | null;
}

export function TextCaseView({
  textCase,
  loading = false,
  isStreaming = false,
  streamingContent,
  onTextCaseChange,
  onJsScriptGenerated,
  jsScript: externalJsScript,
  onSync,
  onNavigateToDetail,
  syncedCaseId,
}: TextCaseViewProps) {
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingTextCase, setEditingTextCase] = useState<TextCase | null>(null);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingStepIndex, setEditingStepIndex] = useState<number>(-1);
  const [editForm, setEditForm] = useState<{
    description: string;
    expect: string;
  }>({
    description: '',
    expect: '',
  });
  const [insertModalVisible, setInsertModalVisible] = useState(false);
  const [insertPosition, setInsertPosition] = useState<{ index: number; direction: 'up' | 'down' }>({ index: 0, direction: 'down' });
  const [insertForm, setInsertForm] = useState<{
    description: string;
    expect: string;
  }>({
    description: '',
    expect: '',
  });
  const [activeTab, setActiveTab] = useState<'steps' | 'code'>('steps');
  const [isGeneratingJs, setIsGeneratingJs] = useState(false);
  const [generatedJsScript, setGeneratedJsScript] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [localSyncedCaseId, setLocalSyncedCaseId] = useState<number | null>(null);

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case '1':
        return 'red';
      case '2':
        return 'orange';
      case '3':
        return 'blue';
      default:
        return 'default';
    }
  };

  const handleEnterEditMode = () => {
    if (!textCase) return;
    setEditingTextCase(JSON.parse(JSON.stringify(textCase)));
    setIsEditMode(true);
  };

  const handleCancelEdit = () => {
    setIsEditMode(false);
    setEditingTextCase(null);
  };

  const handleSaveEdit = () => {
    if (!editingTextCase || !onTextCaseChange) return;
    onTextCaseChange(editingTextCase);
    setIsEditMode(false);
    message.success('修改已保存');
  };

  const handleEditStep = (index: number) => {
    if (!editingTextCase) return;
    const step = editingTextCase.steps[index];
    setEditingStepIndex(index);
    setEditForm({
      description: step.description,
      expect: step.expect || '',
    });
    setEditModalVisible(true);
  };

  const handleSaveEditStep = () => {
    if (!editingTextCase || editingStepIndex < 0) return;
    const newSteps = [...editingTextCase.steps];
    newSteps[editingStepIndex] = {
      ...newSteps[editingStepIndex],
      description: editForm.description,
      expect: editForm.expect || undefined,
    };
    setEditingTextCase({
      ...editingTextCase,
      steps: newSteps,
    });
    setEditModalVisible(false);
    setEditingStepIndex(-1);
  };

  const handleDeleteStep = (index: number) => {
    if (!editingTextCase) return;
    const newSteps = editingTextCase.steps.filter((_, i) => i !== index);
    setEditingTextCase({
      ...editingTextCase,
      steps: newSteps.map((step, i) => ({
        ...step,
        stepIndex: i + 1,
      })),
    });
  };

  const handleInsertStep = (index: number, direction: 'up' | 'down') => {
    setInsertPosition({ index, direction });
    setInsertForm({
      description: '',
      expect: '',
    });
    setInsertModalVisible(true);
  };

  const handleSaveInsertStep = () => {
    if (!editingTextCase) return;
    const newStep: TextCaseStep = {
      id: Date.now(),
      description: insertForm.description,
      expect: insertForm.expect || undefined,
      stepIndex: 0,
    };
    
    const insertIndex = insertPosition.direction === 'up' 
      ? insertPosition.index 
      : insertPosition.index + 1;
    
    const newSteps = [...editingTextCase.steps];
    newSteps.splice(insertIndex, 0, newStep);
    
    setEditingTextCase({
      ...editingTextCase,
      steps: newSteps.map((step, i) => ({
        ...step,
        stepIndex: i + 1,
      })),
    });
    setInsertModalVisible(false);
  };

  const handleAddStepToEnd = () => {
    if (!editingTextCase) return;
    setInsertPosition({ index: editingTextCase.steps.length - 1, direction: 'down' });
    setInsertForm({
      description: '',
      expect: '',
    });
    setInsertModalVisible(true);
  };

  const handleEditTitle = (title: string) => {
    if (!editingTextCase) return;
    setEditingTextCase({
      ...editingTextCase,
      caseTitle: title,
    });
  };

  const convertToTextCaseData = (tc: TextCase): TextCaseData => {
    return {
      steps: tc.steps.map((step, index) => ({
        id: step.id || Date.now() + index,
        description: step.description,
        expect: step.expect,
        stepIndex: step.stepIndex || index + 1,
      })),
    };
  };

  const handleGenerateJsScript = async () => {
    const dataToUse = editingTextCase || textCase;
    
    if (!dataToUse || dataToUse.steps.length === 0) {
      message.warning('没有可用的步骤数据，无法生成JS脚本');
      return;
    }

    setIsGeneratingJs(true);
    setGeneratedJsScript('');
    setActiveTab('code');
    
    try {
      const modelConfig = globalModelConfigManager.getModelConfig('default');
      const textCaseData = convertToTextCaseData(dataToUse);
      
      const result = await generateJsScriptFromTextCase(
        textCaseData,
        {
          stream: true,
          onChunk: (chunk) => {
            setGeneratedJsScript(chunk.accumulated);
          },
        },
        modelConfig,
      );
      
      if (onJsScriptGenerated) {
        onJsScriptGenerated(result);
      }
      
      message.success('JS脚本生成成功');
    } catch (err) {
      console.error('[TextCaseView] Generate JS script error:', err);
      message.error(`生成失败: ${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setIsGeneratingJs(false);
    }
  };

  const handleSync = async () => {
    if (!onSync) return;
    
    setIsSyncing(true);
    try {
      const result = await onSync();
      if (result.cancelled) {
        return;
      }
      if (result.success) {
        if (result.caseId) {
          setLocalSyncedCaseId(result.caseId);
        }
        message.success('同步成功');
      } else {
        message.error('同步失败');
      }
    } catch (err) {
      console.error('[TextCaseView] Sync error:', err);
      message.error('同步失败');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleNavigateToDetail = () => {
    const caseId = localSyncedCaseId || syncedCaseId;
    if (caseId && onNavigateToDetail) {
      onNavigateToDetail(caseId);
    }
  };

  const currentSyncedCaseId = localSyncedCaseId || syncedCaseId;

  const renderStep = useCallback((step: TextCaseStep, index: number) => {
    if (isEditMode && editingTextCase) {
      return (
        <div key={step.id || index} className="step-item edit-mode">
          <div className="step-number">
            <span>{index + 1}</span>
          </div>
          <div className="step-content">
            <div className="step-description">
              <Text>{step.description}</Text>
            </div>
            {step.expect && (
              <div className="step-expect">
                <CheckCircleOutlined className="expect-icon" />
                <Text type="secondary">{step.expect}</Text>
              </div>
            )}
          </div>
          <div className="step-actions">
            <Tooltip title="向上插入步骤" mouseEnterDelay={0}>
              <Button 
                type="text" 
                size="small" 
                icon={<ArrowUpOutlined />}
                onClick={() => handleInsertStep(index, 'up')}
              />
            </Tooltip>
            <Tooltip title="向下插入步骤" mouseEnterDelay={0}>
              <Button 
                type="text" 
                size="small" 
                icon={<ArrowDownOutlined />}
                onClick={() => handleInsertStep(index, 'down')}
              />
            </Tooltip>
            <Button 
              type="text" 
              size="small" 
              icon={<EditOutlined />}
              onClick={() => handleEditStep(index)}
              title="编辑步骤"
            />
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
                title="删除步骤"
              />
            </Popconfirm>
          </div>
        </div>
      );
    }

    return (
      <div key={step.id || index} className="step-item">
        <div className="step-number">
          <span>{step.stepIndex || index + 1}</span>
        </div>
        <div className="step-content">
          <div className="step-description">
            <Text>{step.description}</Text>
          </div>
          {step.expect && (
            <div className="step-expect">
              <CheckCircleOutlined className="expect-icon" />
              <Text type="secondary">{step.expect}</Text>
            </div>
          )}
        </div>
      </div>
    );
  }, [isEditMode, editingTextCase]);

  if (loading && !textCase) {
    return (
      <div className="text-case-view loading">
        <Spin tip="生成测试用例中..." />
      </div>
    );
  }

  if (isStreaming && !textCase) {
    return (
      <div className="text-case-view streaming">
        <Spin tip="AI 正在生成测试用例..." />
        {streamingContent && (
          <pre className="streaming-content">{streamingContent}</pre>
        )}
      </div>
    );
  }

  if (!textCase) {
    return (
      <div className="text-case-view empty">
        <Empty description="暂无测试用例" />
      </div>
    );
  }

  const displayTextCase = isEditMode && editingTextCase ? editingTextCase : textCase;
  const displayJsScript = generatedJsScript || externalJsScript || '';

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
          <div className="case-title-section">
            {isEditMode && editingTextCase ? (
              <Input
                value={editingTextCase.caseTitle}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleEditTitle(e.target.value)}
                className="case-title-input"
                placeholder="请输入用例标题"
              />
            ) : (
              <Title level={4} className="case-title">
                {displayTextCase.caseTitle}
              </Title>
            )}
            <div className="case-meta">
              <Tag color={getPriorityColor(displayTextCase.casePriority)}>
                P{displayTextCase.casePriority}
              </Tag>
            </div>
          </div>

          <div className="steps-section">
            <div className="steps-header">
              <span className="steps-title">测试步骤</span>
              <span className="steps-count">{displayTextCase.steps.length} 步</span>
            </div>
            <div className="steps-list">
              {displayTextCase.steps.map((step, index) => renderStep(step, index))}
              {isEditMode && (
                <Button 
                  type="dashed" 
                  block 
                  icon={<PlusOutlined />}
                  onClick={handleAddStepToEnd}
                  className="add-step-btn"
                >
                  添加步骤
                </Button>
              )}
            </div>
          </div>
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
              <code>{displayJsScript || '// 暂无脚本内容，请点击"生成JS脚本"按钮生成'}</code>
            </pre>
          </Card>
        </div>
      ),
    },
  ];

  return (
    <div className="text-case-view">
      <div className="text-case-header-bar">
        <div className="header-left">
          <FileTextOutlined className="header-icon" />
          <span className="header-title">文本用例</span>
        </div>
        <div className="header-actions">
          {!isEditMode && (
            <>
              <Tooltip title="生成JS脚本">
                <Button 
                  size="small"
                  icon={<StarIcon />}
                  onClick={handleGenerateJsScript}
                  loading={isGeneratingJs}
                  className="star-btn"
                />
              </Tooltip>
              {onSync && (
                <Tooltip title="同步到平台">
                  <Button 
                    size="small"
                    icon={<CloudUploadOutlined />}
                    onClick={handleSync}
                    loading={isSyncing}
                  />
                </Tooltip>
              )}
              {currentSyncedCaseId && onNavigateToDetail && (
                <Tooltip title="跳转执行页">
                  <Button 
                    size="small"
                    icon={<RightOutlined />}
                    onClick={handleNavigateToDetail}
                  />
                </Tooltip>
              )}
            </>
          )}
          {isEditMode ? (
            <>
              <Tooltip title="取消">
                <Button 
                  size="small"
                  icon={<CloseOutlined />}
                  onClick={handleCancelEdit}
                />
              </Tooltip>
              <Tooltip title="保存">
                <Button 
                  size="small"
                  type="primary"
                  icon={<SaveOutlined />}
                  onClick={handleSaveEdit}
                />
              </Tooltip>
            </>
          ) : (
            <Tooltip title="编辑">
              <Button 
                size="small"
                icon={<EditOutlined />}
                onClick={handleEnterEditMode}
              />
            </Tooltip>
          )}
        </div>
      </div>

      <div className="text-case-content">
        <Tabs 
          activeKey={activeTab} 
          onChange={(key) => setActiveTab(key as 'steps' | 'code')}
          items={tabItems}
          className="text-case-tabs"
        />
      </div>

      <Modal
        title="编辑步骤"
        open={editModalVisible}
        onOk={handleSaveEditStep}
        onCancel={() => setEditModalVisible(false)}
        okText="保存"
        cancelText="取消"
      >
        <div className="edit-form">
          <div className="form-item">
            <label>步骤描述：</label>
            <TextArea
              value={editForm.description}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setEditForm({ ...editForm, description: e.target.value })}
              placeholder="请输入步骤描述"
              rows={3}
            />
          </div>
          <div className="form-item">
            <label>预期结果：</label>
            <TextArea
              value={editForm.expect}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setEditForm({ ...editForm, expect: e.target.value })}
              placeholder="请输入预期结果（可选）"
              rows={2}
            />
          </div>
        </div>
      </Modal>

      <Modal
        title={insertPosition.direction === 'up' ? '向上插入步骤' : '向下插入步骤'}
        open={insertModalVisible}
        onOk={handleSaveInsertStep}
        onCancel={() => setInsertModalVisible(false)}
        okText="插入"
        cancelText="取消"
      >
        <div className="edit-form">
          <div className="form-item">
            <label>步骤描述：</label>
            <TextArea
              value={insertForm.description}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setInsertForm({ ...insertForm, description: e.target.value })}
              placeholder="请输入步骤描述"
              rows={3}
            />
          </div>
          <div className="form-item">
            <label>预期结果：</label>
            <TextArea
              value={insertForm.expect}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setInsertForm({ ...insertForm, expect: e.target.value })}
              placeholder="请输入预期结果（可选）"
              rows={2}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
