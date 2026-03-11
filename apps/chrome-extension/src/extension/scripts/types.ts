export interface ScriptListItem {
  id: number;
  dongTestCaseId?: number;
  dongTestDirId?: number;
  caseTitle: string;
  caseDetail?: string;
  autoCaseDetail?: string;
  appName?: string;
  priority?: number;
  priorityName?: string;
  label?: string | null;
  platform?: number;
  platformName?: string;
  caseType?: number;
  caseTypeName?: string;
  createUser: string;
  updateUser?: string;
  createTime?: string;
  updateTime?: string;
  yamlScript?: string | null;
  runParams?: string | null;
}

export interface ScriptListResponse {
  code: number;
  message: string;
  data: {
    list: ScriptListItem[];
    total: number;
    pageNum: number;
    pageSize: number;
  };
}

export interface ScriptTask {
  name: string;
  stepId: number;
  continueOnError?: boolean;
  flow: ScriptFlowItem[];
}

export interface ScriptFlowItem {
  aiTap?: string;
  aiAct?: string;
  aiAction?: string;
  aiAssert?: string;
  aiQuery?: string;
  aiInput?: string;
  aiWaitFor?: string;
  ai?: string;
  sleep?: number;
  deepThink?: boolean;
  errorMessage?: string;
  locate?: string;
  value?: string;
  timeout?: number;
}

export interface ScriptDetail {
  id: number;
  caseTitle: string;
  caseDetail?: string;
  yamlScript?: string;
  autoCaseDetail?: string;
  appName?: string;
  priority?: number;
  priorityName?: string;
  platform?: number;
  platformName?: string;
  createUser: string;
  createTime?: string;
  updateTime?: string;
}

export interface ScriptDetailResponse {
  code: number;
  message: string;
  data: ScriptDetail;
}

export type ScriptExecutionStatus = 'idle' | 'running' | 'success' | 'error';

export interface ScriptExecutionState {
  status: ScriptExecutionStatus;
  currentTaskIndex: number;
  currentStepIndex: number;
  errorMessage?: string;
  logs: string[];
}
