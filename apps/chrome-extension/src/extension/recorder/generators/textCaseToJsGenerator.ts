import type {
  StreamingAIResponse,
  StreamingCallback,
} from '@midscene/core';
import { callAI, callAIWithStringResponse } from '@midscene/core/ai-model';
import type { ChatCompletionMessageParam } from '@midscene/core/ai-model';
import type { IModelConfig } from '@midscene/shared/env';
import { recordLogger } from '../logger';
import { handleTestGenerationError } from './shared/testGenerationUtils';

export interface TextCaseStep {
  id: number;
  description: string;
  expect?: string;
  stepIndex: number;
}

export interface TextCaseData {
  steps: TextCaseStep[];
}

export interface JsScriptGenerationOptions {
  stream?: boolean;
  onChunk?: StreamingCallback;
}

const TEXT_CASE_TO_JS_PROMPT = `# 文本用例转JavaScript脚本 Prompt

## 角色
你是Midscene自动化框架专家，负责将JSON格式测试用例转换为JavaScript测试脚本。

---

## 核心API速查

### 交互方法
- \`aiTap(元素)\` - 点击（仅在点击icon时加deepThink）
- \`aiInput(元素, {value:"文本"})\` - 输入
- \`aiHover(元素)\` - 悬停
- \`aiDoubleClick(元素)\` - 双击
- \`aiAct(\`描述\`)\` - 复杂多步骤操作
- \`aiScroll(元素, {direction, distance})\` - 滚动
参数解释：direction?: 'down' | 'up' | 'left' | 'right' - 滚动方向,向上滚动用up,向下滚动用down,向左滚动用left,向右滚动用right
distance?: number | null - 滚动距离，单位为像素。默认值300
- \`aiKeyboardPress(元素, {keyName:"Enter"})\` - 键盘

### 数据提取
- \`aiQuery(\`string[], 列表\`)\` - 提取数组
- \`aiBoolean(\`条件\`)\` - 提取布尔值
- \`aiString(\`描述\`)\` - 提取字符串
- \`aiNumber(\`描述\`)\` - 提取数字

### 断言
- \`aiAssert(\`条件\`, \`错误信息\`)\` - 验证UI状态

---

## 输入格式
\`\`\`json
{
  "steps": [
    {"expect": "期望（可选）", "description": "操作描述", "id": 步骤ID}
  ]
}
\`\`\`

---

## 输出模板
\`\`\`javascript
const joyTest = new JoyTest(page, agent, platform, {
  executionId: params?.executionId ?? 1, 
  stopOnStepFailure: params.stopOnStepFailure ?? 1,
  deviceId: params?.deviceId
});

try {
  await joyTest.preTest();
  await agent.setAIActionContext(\`如果弹窗遮挡了操作元素，优先关闭弹窗；\`);
  
  await joyTest.runTest(async () => {
    // 步骤代码
  });
  
} catch (error) {
  console.error(\`测试过程中出现异常:\`, error);
  throw error;
} finally {
  await joyTest.postTest();
}
\`\`\`

---

## 生成规则

### 基本规则
1. 每个step字段生成\`executeStep(描述, async()=>{操作}, id)\`
2. 有expect字段则生成\`executeAssert(期望, \'UI\', async()=>{断言}, id)\`, 都用aiAssert()
3. 描述含引号用反引号包裹

### API选择决策
\`\`\`
点击 → aiTap()（仅在点击icon时加deepThink）
输入 → aiInput()
悬停 → aiHover()
双击 → aiDoubleClick()
简单滚动 → aiScroll()（固定距离，如"向下滚动300像素"）
等待 → sleep(毫秒)
复杂操作 → aiAct()（包括以下场景）
  - 循环操作（如"依次点击所有菜单项"）
  - 条件判断（如"如果有X则点击，否则点击Y"）
  - 复杂滚动（如"滚动到页面底部"、"滚动直到看到X"）
  - 多步骤组合操作
断言 → aiAssert()
\`\`\`

### 关键规则
- **icon操作必加deepThink**: \`aiTap(\`icon\`, {deepThink: true})\`
- **字符串含引号用反引号**: \`\`描述"内容"\` \`
- **等待固定时间**: \`sleep(毫秒)\`
- **复杂操作用aiAct**: 任何需要循环、条件判断、复杂滚动的操作都用aiAct
- **滚动操作**: 上滑要转化成向下滚动用down, 下滑要转化成向上滚动用up
- **所有参数都用反引号包裹**: 包括描述、期望、断言等
---
## 示例

### 输入
\`\`\`json
{
  "steps": [
    {"expect": "进入个人中心", "description": "点击头像", "id": 1},
    {"description": "等待3s", "id": 2},
    {"expect": "搜索框显示iphone", "description": "在搜索框输入'iphone'", "id": 3},
    {"expect": "清空菜单", "description": "依次点击菜单项的"-"icon", "id": 4},
    {"expect": "跳转首页", "description": "有首页icon点首页，否则点返回", "id": 5},
    {"description": "上滑页面", "id": 6},
    {"description": "滚动到页面底部", "id": 7},
    {"description": "滚动直到看到商品列表", "id": 8}
  ]
}
\`\`\`

### 输出

const joyTest = new JoyTest(page, agent, platform, {
  executionId: params?.executionId ?? 1, 
  stopOnStepFailure: params.stopOnStepFailure ?? 1,
  deviceId: params?.deviceId
});

try {
  await joyTest.preTest();
  await agent.setAIActionContext(\`如果弹窗遮挡了操作元素，优先关闭弹窗；\`);
  
  await joyTest.runTest(async () => {
    
    // 点击头像
    await joyTest.executeStep(\`点击头像\`, async () => {
      await agent.aiTap(\`头像\`);
    }, 1);
    
    await joyTest.executeAssert(\`进入个人中心\`, \`UI\`, async () => {
      await agent.aiAssert(\`成功进入个人中心\`, \`未成功进入个人中心\`);
      return true;
    }, 1);
    
    // 等待3s
    await joyTest.executeStep(\`等待3s\`, async () => {
      await sleep(3000);
    }, 2);
    
    // 在搜索框输入'iphone'
    await joyTest.executeStep(\`在搜索框输入'iphone'\`, async () => {
      await agent.aiInput(\`搜索框\`, { value: 'iphone' });
    }, 3);
    
    await joyTest.executeAssert(\`搜索框显示iphone\`, \`UI\`, async () => {
      await agent.aiAssert(\`搜索框显示iphone\`, \`搜索框未显示iphone\`);
      return true;
    }, 3);
    
    // 依次点击菜单项的"-"icon
    await joyTest.executeStep(\`依次点击菜单项的"-"icon\`, async () => {
      await agent.aiAct(\`依次点击所有菜单项的"-"icon\`);
    }, 4);
    
    await joyTest.executeAssert(\`清空菜单\`, \`UI\`, async () => {
      await agent.aiAssert(\`菜单已清空\`, \`菜单未清空\`);
      return true;
    }, 4);
    
    // 有首页icon点首页，否则点返回
    await joyTest.executeStep(\`有首页icon点首页，否则点返回\`, async () => {
      await agent.aiAct(\`如果有首页icon则点击首页icon，否则点击返回按钮\`);
    }, 5);
    
    await joyTest.executeAssert(\`跳转首页\`, \`UI\`, async () => {
      await agent.aiAssert(\`成功跳转首页\`, \`未成功跳转首页\`);
      return true;
    }, 5);
    
    // 上滑页面
    await joyTest.executeStep(\`向下滚动页面\`, async () => {
      await agent.aiScroll(\`页面\`, { direction: "down", distance: 300 });
    }, 6);
    
    // 滚动到页面底部
    await joyTest.executeStep(\`滚动到页面底部\`, async () => {
      await agent.aiAct(\`滚动到页面底部\`);
    }, 7);
    
    // 滚动直到看到商品列表
    await joyTest.executeStep(\`滚动直到看到商品列表\`, async () => {
      await agent.aiAct(\`滚动页面直到看到商品列表\`);
    }, 8);
    
  });
  
} catch (error) {
  console.error(\`测试过程中出现异常:\`, error);
  throw error;
} finally {
  await joyTest.postTest();
}


## 特殊场景模板

### 简单滚动（固定距离）
\`\`\`javascript
// 向下滚动300像素
await agent.aiScroll(\`页面\`, { direction: "down", distance: 300 });
\`\`\`

### 复杂操作（使用aiAct）
\`\`\`javascript
// 循环操作
await agent.aiAct(\`依次点击所有菜单项的删除按钮\`);

// 条件判断
await agent.aiAct(\`如果有确认按钮则点击确认，否则点击取消\`);

// 复杂滚动
await agent.aiAct(\`滚动到页面底部\`);
await agent.aiAct(\`滚动直到看到"加载更多"按钮\`);

// 多步骤组合
await agent.aiAct(\`点击第一个商品，然后点击加入购物车，最后关闭弹窗\`);
\`\`\`

### 等待操作
\`\`\`javascript
// 固定时间
await sleep(3000);

// 条件等待
await agent.aiWaitFor(\`等待XXX加载完成\`);
\`\`\`

---

## 重要提示
- 直接输出JavaScript脚本代码，不要使用markdown代码块标签（如\`\`\`javascript）
- 不要添加任何解释说明，只输出可执行的脚本代码
- 复杂操作（循环、条件、复杂滚动）统一使用aiAct方法`;

export function parseTextCaseData(jsonString: string): TextCaseData | null {
  try {
    const parsed = JSON.parse(jsonString);
    if (parsed.steps && Array.isArray(parsed.steps)) {
      return parsed as TextCaseData;
    }
    return null;
  } catch (e) {
    console.error('[parseTextCaseData] Failed to parse:', e);
    return null;
  }
}

export async function generateJsScriptFromTextCase(
  textCaseData: TextCaseData,
  options: JsScriptGenerationOptions = {},
  modelConfig: IModelConfig,
): Promise<string> {
  const { stream, onChunk } = options;

  const userMessage = `请将以下文本用例转换为JavaScript脚本：

\`\`\`json
${JSON.stringify(textCaseData, null, 2)}
\`\`\`

只输出JavaScript代码，不要输出任何其他说明文字。`;

  const messages: ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: TEXT_CASE_TO_JS_PROMPT,
    },
    {
      role: 'user',
      content: userMessage,
    },
  ];

  recordLogger.info('Generating JS script from text case', {
    stepsCount: textCaseData.steps.length,
    stream,
  });

  try {
    if (stream && onChunk) {
      const streamingResponse = await callAI(messages, modelConfig, {
        stream: true,
        onChunk,
      });
      return streamingResponse.content || '';
    } else {
      const response = await callAIWithStringResponse(messages, modelConfig);
      return response?.content || '';
    }
  } catch (error) {
    handleTestGenerationError(error, 'JS script generation');
    throw error;
  }
}
