import { Modal, Button, Tag, List } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, LoadingOutlined } from '@ant-design/icons';
import type { ExecutionState } from '../hooks/useYamlExecution';
import './ExecutionLogModal.less';

interface ExecutionLogModalProps {
  open: boolean;
  state: ExecutionState;
  onClose: () => void;
  onStop: () => void;
}

export function ExecutionLogModal({ open, state, onClose, onStop }: ExecutionLogModalProps) {
  const getStatusTag = () => {
    switch (state.status) {
      case 'running':
        return <Tag color="processing" icon={<LoadingOutlined />}>Running</Tag>;
      case 'success':
        return <Tag color="success" icon={<CheckCircleOutlined />}>Success</Tag>;
      case 'error':
        return <Tag color="error" icon={<CloseCircleOutlined />}>Error</Tag>;
      default:
        return <Tag color="default">Idle</Tag>;
    }
  };

  return (
    <Modal
      title={
        <div className="execution-modal-header">
          <span>Script Execution</span>
          {getStatusTag()}
        </div>
      }
      open={open}
      onCancel={state.status === 'running' ? undefined : onClose}
      footer={
        state.status === 'running' ? (
          <Button danger icon={<LoadingOutlined />} onClick={onStop}>
            Stop Execution
          </Button>
        ) : (
          <Button type="primary" onClick={onClose}>
            Close
          </Button>
        )
      }
      width={600}
      className="execution-log-modal"
      maskClosable={false}
      closable={state.status !== 'running'}
    >
      <div className="execution-content">
        {state.status === 'running' && (
          <div className="execution-progress">
            <div className="progress-item">
              <span className="progress-label">Current Task:</span>
              <span className="progress-value">{state.currentTaskIndex + 1}</span>
            </div>
            <div className="progress-item">
              <span className="progress-label">Current Step:</span>
              <span className="progress-value">{state.currentStepIndex + 1}</span>
            </div>
          </div>
        )}

        {state.error && (
          <div className="execution-error">
            <strong>Error:</strong> {state.error}
          </div>
        )}

        <div className="execution-logs">
          <h4>Execution Logs</h4>
          <List
            dataSource={state.logs}
            renderItem={(log) => (
              <List.Item className="log-item">
                <code>{log}</code>
              </List.Item>
            )}
            style={{ maxHeight: 300, overflow: 'auto' }}
          />
        </div>
      </div>
    </Modal>
  );
}
