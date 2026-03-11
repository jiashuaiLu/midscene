import type {
  ScriptDetailResponse,
  ScriptListResponse,
} from './types';

const API_BASE_URL = 'https://joy-ai-test.jd.com';

export async function fetchScriptList(params: {
  pageNum: number;
  pageSize: number;
  caseName?: string;
  creator?: string;
  hasAutoCaseDetail?: boolean;
}): Promise<ScriptListResponse> {
  const queryParams = new URLSearchParams({
    pageNum: String(params.pageNum),
    pageSize: String(params.pageSize),
    caseName: params.caseName || '',
    creator: params.creator || '',
  });

  if (params.hasAutoCaseDetail) {
    queryParams.set('hasAutoCaseDetail', 'true');
  }

  const url = `${API_BASE_URL}/case/list?${queryParams}`;

  console.log('[Scripts API] Fetching script list:', url);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data: ScriptListResponse = await response.json();
    console.log('[Scripts API] Script list response:', data);
    return data;
  } catch (error) {
    console.error('[Scripts API] Failed to fetch script list:', error);
    throw error;
  }
}

export async function fetchScriptDetail(id: number): Promise<ScriptDetailResponse> {
  const url = `${API_BASE_URL}/case/detail/${id}`;

  console.log('[Scripts API] Fetching script detail:', url);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data: ScriptDetailResponse = await response.json();
    console.log('[Scripts API] Script detail response:', data);
    return data;
  } catch (error) {
    console.error('[Scripts API] Failed to fetch script detail:', error);
    throw error;
  }
}
