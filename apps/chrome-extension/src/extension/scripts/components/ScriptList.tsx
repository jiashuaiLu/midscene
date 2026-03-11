import { Input, List, Spin, Empty, Tag, Tooltip, message } from 'antd';
import { SearchOutlined, PlayCircleOutlined, FileTextOutlined, ExportOutlined } from '@ant-design/icons';
import { useEffect, useState, useCallback, useRef } from 'react';
import type { ScriptListItem } from '../types';
import { fetchScriptList } from '../api';
import './ScriptList.less';

interface ScriptListProps {
  onSelectScript: (script: ScriptListItem) => void;
  savedFilters?: { caseTitle: string; createUser: string } | null;
  onFiltersChange?: (filters: { caseTitle: string; createUser: string }) => void;
}

export function ScriptList({ onSelectScript, savedFilters, onFiltersChange }: ScriptListProps) {
  const [scripts, setScripts] = useState<ScriptListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [caseTitle, setCaseTitle] = useState(savedFilters?.caseTitle || '');
  const [createUser, setCreateUser] = useState(savedFilters?.createUser || '');
  const [pageNum, setPageNum] = useState(1);
  const pageSize = 15;
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);

  const loadScripts = useCallback(async (page: number, reset = false) => {
    if (loading) return;
    
    setLoading(true);
    setError(null);
    try {
      const response = await fetchScriptList({
        pageNum: page,
        pageSize: pageSize,
        caseName: caseTitle || undefined,
        creator: createUser || undefined,
        hasAutoCaseDetail: true,
      });

      if (response.code === 200 && response.data) {
        const newList = response.data.list || [];
        if (reset) {
          setScripts(newList);
        } else {
          setScripts(prev => [...prev, ...newList]);
        }
        setTotal(response.data.total || 0);
        const currentTotal = reset ? newList.length : scripts.length + newList.length;
        setHasMore(newList.length === pageSize && currentTotal < (response.data.total || 0));
      } else {
        setError(response.message || 'Failed to load scripts');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load scripts');
      console.error('[ScriptList] Error loading scripts:', err);
    } finally {
      setLoading(false);
    }
  }, [caseTitle, createUser, loading, scripts.length]);

  const handleSearch = useCallback(() => {
    setPageNum(1);
    setScripts([]);
    setHasMore(true);
    if (onFiltersChange) {
      onFiltersChange({ caseTitle, createUser });
    }
    loadScripts(1, true);
  }, [loadScripts, caseTitle, createUser, onFiltersChange]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    const scrollBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
    
    if (scrollBottom < 100 && hasMore && !loading) {
      const nextPage = pageNum + 1;
      setPageNum(nextPage);
      loadScripts(nextPage);
    }
  }, [hasMore, loading, pageNum, loadScripts]);

  useEffect(() => {
    loadScripts(1, true);
  }, []);

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  const handleExecuteClick = (e: React.MouseEvent, script: ScriptListItem) => {
    e.stopPropagation();
    if (!script.yamlScript) {
      message.warning('该脚本没有可执行的 YAML 内容');
      return;
    }
    onSelectScript(script);
  };

  return (
    <div className="script-list-container">
      <div className="script-list-header">
        <h3>脚本列表</h3>
        <div className="search-bar">
          <Input
            placeholder="搜索用例标题..."
            prefix={<SearchOutlined />}
            value={caseTitle}
            onChange={(e) => setCaseTitle(e.target.value)}
            onPressEnter={handleSearch}
            allowClear
            style={{ marginBottom: 8 }}
          />
          <Input
            placeholder="创建者..."
            value={createUser}
            onChange={(e) => setCreateUser(e.target.value)}
            onPressEnter={handleSearch}
            allowClear
          />
        </div>
        <div className="search-actions">
          <span className="total-count">共 {total} 条记录</span>
        </div>
      </div>

      <div 
        className="script-list-content" 
        ref={listRef}
        onScroll={handleScroll}
      >
        {loading && scripts.length === 0 ? (
          <div className="loading-container">
            <Spin tip="加载中..." />
          </div>
        ) : error ? (
          <div className="error-container">
            <Empty description={error} />
          </div>
        ) : scripts.length === 0 ? (
          <Empty description="暂无脚本" />
        ) : (
          <>
            <List
              dataSource={scripts}
              renderItem={(script) => (
                <List.Item
                  className="script-item"
                >
                  <div 
                    className="script-item-content"
                    onClick={() => onSelectScript(script)}
                  >
                    <div className="script-item-header">
                      <span className="script-name">{script.caseTitle}</span>
                      <div className="script-tags">
                        {script.appName && (
                          <Tag color="green">{script.appName}</Tag>
                        )}
                      </div>
                    </div>
                    <div className="script-item-meta">
                      <span className="script-creator">创建者: {script.createUser}</span>
                      {script.createTime && (
                        <span className="script-time">创建于 {formatDate(script.createTime)}</span>
                      )}
                    </div>
                  </div>
                  <div className="script-item-actions">
                    <Tooltip title="在DongGUI平台查看">
                      <a 
                        href={`https://donggui.jd.com/case-management/detail/${script.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="external-link"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ExportOutlined />
                      </a>
                    </Tooltip>
                    <Tooltip title="执行脚本">
                      <PlayCircleOutlined 
                        className="play-icon" 
                        onClick={(e) => handleExecuteClick(e, script)}
                      />
                    </Tooltip>
                  </div>
                </List.Item>
              )}
            />
            {loading && scripts.length > 0 && (
              <div className="loading-more">
                <Spin size="small" />
                <span>加载更多...</span>
              </div>
            )}
            {!hasMore && scripts.length > 0 && (
              <div className="no-more">没有更多了</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
