/// <reference types="chrome" />
import {
  ApiOutlined,
  MenuOutlined,
  PlayCircleOutlined,
  SendOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
import {
  NavActions,
  globalThemeConfig,
  useEnvConfig,
} from '@midscene/visualizer';
import { ConfigProvider, Dropdown } from 'antd';
import { useEffect, useState } from 'react';
import { BrowserExtensionPlayground } from '../../components/playground';
import Bridge from '../bridge';
import Recorder from '../recorder';
import Scripts from '../scripts';
import './index.less';
import { MIDSCENE_MODEL_API_KEY } from '@midscene/shared/env';
import { safeOverrideAIConfig } from '@midscene/visualizer';
import {
  ChromeExtensionProxyPage,
  ChromeExtensionProxyPageAgent,
} from '@midscene/web/chrome-extension';
// remember to destroy the agent when the tab is destroyed: agent.page.destroy()
const extensionAgentForTab = (forceSameTabNavigation = true) => {
  const page = new ChromeExtensionProxyPage(forceSameTabNavigation);
  return new ChromeExtensionProxyPageAgent(page);
};

const STORAGE_KEY = 'midscene-popup-mode';

export function PlaygroundPopup() {
  const { setPopupTab } = useEnvConfig();
  const [currentMode, setCurrentMode] = useState<
    'playground' | 'bridge' | 'recorder' | 'scripts'
  >(() => {
    const savedMode = localStorage.getItem(STORAGE_KEY);
    return (savedMode as 'playground' | 'bridge' | 'recorder' | 'scripts') || 'playground';
  });

  const { config } = useEnvConfig();

  // Sync popupTab with saved mode on mount
  useEffect(() => {
    setPopupTab(currentMode);
  }, []);

  // Override AI configuration
  useEffect(() => {
    console.log('[Midscene Extension] === AI Config Override ===');
    console.log('[Midscene Extension] Config object:', config);
    console.log('[Midscene Extension] Config keys:', config ? Object.keys(config) : []);
    console.log('[Midscene Extension] MIDSCENE_MODEL_API_KEY exists:', !!MIDSCENE_MODEL_API_KEY);
    
    if (config && Object.keys(config).length >= 1) {
      console.log('[Midscene Extension] Applying config override...');
      console.log('[Midscene Extension] Model config details:', {
        MIDSCENE_MODEL_NAME: config.MIDSCENE_MODEL_NAME,
        MIDSCENE_MODEL_BASE_URL: config.MIDSCENE_MODEL_BASE_URL,
        MIDSCENE_MODEL_FAMILY: config.MIDSCENE_MODEL_FAMILY,
        MIDSCENE_PLANNING_MODEL_NAME: config.MIDSCENE_PLANNING_MODEL_NAME,
        MIDSCENE_PLANNING_MODEL_BASE_URL: config.MIDSCENE_PLANNING_MODEL_BASE_URL,
        MIDSCENE_PLANNING_MODEL_FAMILY: config.MIDSCENE_PLANNING_MODEL_FAMILY,
      });
      safeOverrideAIConfig(config);
      console.log('[Midscene Extension] Config override applied successfully');
    } else {
      console.warn('[Midscene Extension] No config to override or config is empty');
    }
  }, [config]);

  const menuItems = [
    {
      key: 'playground',
      icon: <SendOutlined />,
      label: 'Playground',
      onClick: () => {
        setCurrentMode('playground');
        setPopupTab('playground');
        localStorage.setItem(STORAGE_KEY, 'playground');
      },
    },
    {
      key: 'scripts',
      icon: <PlayCircleOutlined />,
      label: 'Scripts',
      onClick: () => {
        setCurrentMode('scripts');
        setPopupTab('scripts');
        localStorage.setItem(STORAGE_KEY, 'scripts');
      },
    },
    {
      key: 'recorder',
      label: 'Recorder (Preview)',
      icon: <VideoCameraOutlined />,
      onClick: () => {
        setCurrentMode('recorder');
        setPopupTab('recorder');
        localStorage.setItem(STORAGE_KEY, 'recorder');
      },
    },
    {
      key: 'bridge',
      icon: <ApiOutlined />,
      label: 'Bridge Mode',
      onClick: () => {
        setCurrentMode('bridge');
        setPopupTab('bridge');
        localStorage.setItem(STORAGE_KEY, 'bridge');
      },
    },
  ];

  const renderContent = () => {
    if (currentMode === 'bridge') {
      return (
        <div className="popup-content bridge-mode">
          <div className="bridge-container">
            <Bridge />
          </div>
        </div>
      );
    }
    if (currentMode === 'recorder') {
      return (
        <div className="popup-content recorder-mode">
          <Recorder />
        </div>
      );
    }
    if (currentMode === 'scripts') {
      return (
        <div className="popup-content scripts-mode">
          <Scripts />
        </div>
      );
    }

    // Check if configuration is ready
    const configReady = config && Object.keys(config).length >= 1;
    console.log('[Midscene Extension] Playground mode - config check:', {
      hasConfig: !!config,
      configKeys: config ? Object.keys(config) : [],
      configReady,
    });

    return (
      <div className="popup-content">
        {/* Playground Component */}
        <div className="playground-component">
          <BrowserExtensionPlayground
            getAgent={(forceSameTabNavigation?: boolean) => {
              console.log('[Midscene Extension] Creating agent with forceSameTabNavigation:', forceSameTabNavigation);
              const agent = extensionAgentForTab(forceSameTabNavigation);
              console.log('[Midscene Extension] Agent created successfully');
              return agent;
            }}
            showContextPreview={false}
          />
        </div>
      </div>
    );
  };

  const getModeTitle = () => {
    switch (currentMode) {
      case 'playground':
        return 'Playground';
      case 'recorder':
        return 'Recorder';
      case 'scripts':
        return 'Scripts';
      case 'bridge':
        return 'Bridge Mode';
      default:
        return 'Playground';
    }
  };

  return (
    <ConfigProvider theme={globalThemeConfig()}>
      <div className="popup-wrapper">
        {/* top navigation bar */}
        <div className="popup-nav">
          <div className="nav-left">
            <Dropdown
              menu={{ items: menuItems }}
              trigger={['click']}
              placement="bottomLeft"
              overlayClassName="mode-selector-dropdown"
            >
              <MenuOutlined className="nav-icon menu-trigger" />
            </Dropdown>
            <span className="nav-title">{getModeTitle()}</span>
          </div>
          <div className="nav-right">
            <NavActions
              showEnvConfig={false}
              showTooltipWhenEmpty={false}
              showModelName={false}
            />
          </div>
        </div>

        {/* main content area */}
        {renderContent()}
      </div>
    </ConfigProvider>
  );
}
