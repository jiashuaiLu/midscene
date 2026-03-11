import { QuestionCircleOutlined, CloudOutlined } from '@ant-design/icons';
import { Typography, Tooltip } from 'antd';
import { EnvConfig } from '../env-config';
import './style.less';

export interface NavActionsProps {
  showEnvConfig?: boolean;
  showTooltipWhenEmpty?: boolean;
  showModelName?: boolean;
  githubUrl?: string;
  helpUrl?: string;
  className?: string;
}

export function NavActions({
  showEnvConfig = true,
  showTooltipWhenEmpty = false,
  showModelName = false,
  githubUrl = 'https://donggui.jd.com/',
  helpUrl = 'https://joyspace.jd.com/pages/XcIhijBn2mjypfz1ZtRi',
  className = '',
}: NavActionsProps) {
  return (
    <div className={`nav-actions ${className}`}>
      <Typography.Link href={githubUrl} target="_blank">
        <Tooltip title="DongGUI平台">
          <CloudOutlined className="nav-icon" />
        </Tooltip>
      </Typography.Link>
      <Typography.Link href={helpUrl} target="_blank">
        <Tooltip title="帮助文档">
          <QuestionCircleOutlined className="nav-icon" />
        </Tooltip>
      </Typography.Link>
      {showEnvConfig && (
        <EnvConfig
          showTooltipWhenEmpty={showTooltipWhenEmpty}
          showModelName={showModelName}
        />
      )}
    </div>
  );
}
