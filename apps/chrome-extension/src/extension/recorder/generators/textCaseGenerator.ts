import type {
  StreamingAIResponse,
  StreamingCallback,
} from '@midscene/core';
import { callAI, callAIWithStringResponse } from '@midscene/core/ai-model';
import type { ChatCompletionMessageParam } from '@midscene/core/ai-model';
import type { ChromeRecordedEvent } from '@midscene/recorder';
import type { IModelConfig } from '@midscene/shared/env';
import { recordLogger } from '../logger';
import { handleTestGenerationError } from './shared/testGenerationUtils';

export interface TextCaseStep {
  id: number;
  description: string;
  expect?: string;
  stepIndex: number;
}

export interface TextCase {
  caseTitle: string;
  steps: TextCaseStep[];
  platform: number;
  casePriority: string;
}

export interface TextCaseGenerationOptions {
  testName?: string;
  description?: string;
  stream?: boolean;
  onChunk?: StreamingCallback;
  maxScreenshots?: number;
}

const TEXT_CASE_EXAMPLE = `
1. 格式:
{
  "caseTitle": "测试用例标题",
  "steps": [
    { "id": 1, "description": "操作描述", "expect": "预期结果(可选)", "stepIndex": 1 }
  ],
  "platform": 1,
  "casePriority": "1"
}

2. 操作类型转换:
- navigation → 跳过，不生成步骤（直接从实际操作开始）
- click → "点击{元素描述}"
- doubleClick → "双击{元素描述}"
- hover → "悬浮在{元素描述}上"
- input → "在{元素描述}输入\"{最终值}\""
- keyboardPress → "按下{按键}键"
- scroll → "向{方向}滚动{元素描述}{距离}像素"（如：向下滚动当前页面300像素）
- assert → "验证{断言内容}"
- waitFor → "等待{条件}"
- sleep → "等待{毫秒数}毫秒"

3. 最佳实践:
- 合并连续的输入事件，只保留最终输入值
- 智能推断元素描述，不要使用 "failed to generate element description"
- 在关键操作后添加预期结果（页面跳转等）
- 使用自然语言描述，简洁明了
- 跳过 navigation 事件，直接从实际操作开始生成步骤
- 滚动{元素描述}时，元素必须是可滚动的（如：搜索结果列表），不指定元素描述，或元素不可滚动时默认滚动当前页面

4. 事件合并规则:
- 连续的 input 事件（如 "i", "iph", "iphone", "iphone17"）合并为一个最终输入操作
- 只保留最终输入值，忽略中间态

5. 元素描述推断规则:
- 当 elementDescription 为空或包含 "failed to generate" 时，根据上下文推断:
  - 第一个点击操作且后面紧跟输入 → "搜索框"
  - 点击按钮后发生页面跳转 → "搜索按钮"或"提交按钮"
  - 点击商品列表项 → "商品链接"
  - 点击购物车相关 → "购物车图标"或"加入购物车按钮"

6. 断言规则（在关键操作后添加预期结果）:
- 点击搜索/提交按钮后 → expect: "页面跳转到搜索结果页"
- 点击商品后 → expect: "页面跳转到商品详情页"
- 点击加入购物车后 → expect: "商品成功加入购物车"
- 点击购物车图标后 → expect: "页面跳转到购物车页面"

示例输入事件:
{
  "events": [
    { "type": "click", "elementDescription": "failed to generate element description" },
    { "type": "input", "value": "i" },
    { "type": "input", "value": "iph" },
    { "type": "input", "value": "iphone" },
    { "type": "input", "value": "iphone17" },
    { "type": "click", "elementDescription": "搜索按钮，位于搜索框右侧，红色背景，文字为'搜索'" },
    { "type": "navigation", "url": "https://search.jd.com/Search?keyword=iphone17" },
    { "type": "click", "elementDescription": "第一个商品" },
    { "type": "navigation", "url": "https://item.jd.com/xxx" },
    { "type": "scroll", "scrollDirection": "down", "scrollDistance": 500, "elementDescription": "搜索结果列表" },
    { "type": "click", "elementDescription": "加入购物车" }
  ]
}

示例输出:
{
  "caseTitle": "京东搜索商品并加入购物车",
  "steps": [
    { "id": 1, "description": "点击搜索框", "stepIndex": 1 },
    { "id": 2, "description": "在搜索框输入\"iphone17\"", "stepIndex": 2 },
    { "id": 3, "description": "点击搜索按钮", "expect": "页面跳转到搜索结果页", "stepIndex": 3 },
    { "id": 4, "description": "点击第一个商品", "expect": "页面跳转到商品详情页", "stepIndex": 4 },
    { "id": 5, "description": "向下滚动搜索结果列表500像素", "stepIndex": 5 },
    { "id": 6, "description": "点击加入购物车按钮", "expect": "商品成功加入购物车", "stepIndex": 6 }
  ],
  "platform": 1,
  "casePriority": "1"
}
`;

const TEXT_CASE_SYSTEM_PROMPT = `你是一位专业的测试工程师，擅长编写清晰、易懂的中文测试用例。遵循以下规则:

${TEXT_CASE_EXAMPLE}

重要提示:
1. 返回纯JSON，不要使用markdown代码块
2. 合并连续输入事件，只保留最终值
3. 智能推断元素描述，不要使用 "failed to generate element description"
4. 所有文本使用中文`;

const TEXT_CASE_USER_PROMPT_TEMPLATE = `根据录制的浏览器操作事件，生成中文测试用例。

事件摘要:
{eventSummary}

转换规则:
- navigation → 跳过，不生成步骤
- click → 点击元素
- doubleClick → 双击元素
- hover → 悬浮在元素上
- input → 输入文本（合并连续输入，只保留最终值）
- keyboardPress → 按下按键
- scroll → 滚动元素（包含方向和距离，如：向下滚动搜索结果列表300像素）
- assert → 验证断言
- waitFor → 等待条件
- sleep → 等待时间
- 在关键操作后添加预期结果
- 直接从实际操作开始，不要生成"打开页面"步骤

重要: 返回纯JSON，不要使用markdown代码块。`;

interface EventCounts {
  navigation: number;
  click: number;
  input: number;
  scroll: number;
  total: number;
}

interface TextCaseEventSummary {
  testName: string;
  startUrl: string;
  eventCounts: EventCounts;
  urls: string[];
  clickDescriptions: string[];
  inputDescriptions: { description: string; value: string }[];
  events: ProcessedEvent[];
}

interface ProcessedEvent {
  type: string;
  timestamp: number;
  url?: string;
  title?: string;
  elementDescription?: string;
  value?: string;
  scrollDirection?: 'up' | 'down' | 'left' | 'right';
  scrollDistance?: number;
}

function validateEvents(events: ChromeRecordedEvent[]): void {
  if (!events || events.length === 0) {
    throw new Error('No events provided for test case generation');
  }
}

function filterEventsByType(events: ChromeRecordedEvent[]) {
  return {
    navigationEvents: events.filter((event) => event.type === 'navigation'),
    clickEvents: events.filter((event) => event.type === 'click'),
    inputEvents: events.filter((event) => event.type === 'input'),
    scrollEvents: events.filter((event) => event.type === 'scroll'),
  };
}

function createEventCounts(
  filteredEvents: ReturnType<typeof filterEventsByType>,
  totalEvents: number,
): EventCounts {
  return {
    navigation: filteredEvents.navigationEvents.length,
    click: filteredEvents.clickEvents.length,
    input: filteredEvents.inputEvents.length,
    scroll: filteredEvents.scrollEvents.length,
    total: totalEvents,
  };
}

function processEventsForLLM(events: ChromeRecordedEvent[]): ProcessedEvent[] {
  let lastScrollX = 0;
  let lastScrollY = 0;
  
  return events.map((event) => {
    const processed: ProcessedEvent = {
      type: event.type,
      timestamp: event.timestamp,
      url: event.url,
      title: event.title,
      elementDescription: event.elementDescription,
      value: event.value,
    };

    if (event.type === 'scroll' && event.value) {
      const parts = event.value.split(',');
      if (parts.length === 2) {
        const currentX = parseFloat(parts[0]) || 0;
        const currentY = parseFloat(parts[1]) || 0;
        const deltaX = currentX - lastScrollX;
        const deltaY = currentY - lastScrollY;

        if (Math.abs(deltaY) > Math.abs(deltaX)) {
          processed.scrollDirection = deltaY > 0 ? 'down' : 'up';
          processed.scrollDistance = Math.abs(Math.round(deltaY));
        } else if (Math.abs(deltaX) > 0) {
          processed.scrollDirection = deltaX > 0 ? 'right' : 'left';
          processed.scrollDistance = Math.abs(Math.round(deltaX));
        }

        lastScrollX = currentX;
        lastScrollY = currentY;
      }
    }

    return processed;
  });
}

function prepareEventSummary(
  events: ChromeRecordedEvent[],
  options: { testName?: string } = {},
): TextCaseEventSummary {
  const filteredEvents = filterEventsByType(events);
  const eventCounts = createEventCounts(filteredEvents, events.length);

  const startUrl =
    filteredEvents.navigationEvents.length > 0
      ? filteredEvents.navigationEvents[0].url || ''
      : '';

  const clickDescriptions = filteredEvents.clickEvents
    .map((event) => event.elementDescription)
    .filter((desc): desc is string => Boolean(desc))
    .slice(0, 10);

  const inputDescriptions = filteredEvents.inputEvents
    .map((event) => ({
      description: event.elementDescription || '',
      value: event.value || '',
    }))
    .filter((item) => item.description && item.value)
    .slice(0, 10);

  const urls = filteredEvents.navigationEvents
    .map((e) => e.url)
    .filter((url): url is string => Boolean(url))
    .slice(0, 5);

  const processedEvents = processEventsForLLM(events);

  return {
    testName: options.testName || 'Automated test case from recorded events',
    startUrl,
    eventCounts,
    urls,
    clickDescriptions,
    inputDescriptions,
    events: processedEvents,
  };
}

function getScreenshotsForLLM(
  events: ChromeRecordedEvent[],
  maxScreenshots = 1,
): string[] {
  const eventsWithScreenshots = events.filter(
    (event) =>
      event.screenshotBefore ||
      event.screenshotAfter ||
      event.screenshotWithBox,
  );

  const sortedEvents = [...eventsWithScreenshots].sort((a, b) => {
    if (a.type === 'navigation' && b.type !== 'navigation') return -1;
    if (a.type !== 'navigation' && b.type === 'navigation') return 1;
    if (a.type === 'click' && b.type !== 'click') return -1;
    if (a.type !== 'click' && b.type === 'click') return 1;
    return 0;
  });

  const screenshots: string[] = [];
  for (const event of sortedEvents) {
    const screenshot =
      event.screenshotWithBox ||
      event.screenshotAfter ||
      event.screenshotBefore;
    if (screenshot && !screenshots.includes(screenshot)) {
      screenshots.push(screenshot);
      if (screenshots.length >= maxScreenshots) break;
    }
  }

  return screenshots;
}

export const generateTextCase = async (
  events: ChromeRecordedEvent[],
  options: TextCaseGenerationOptions,
  modelConfig: IModelConfig,
): Promise<TextCase> => {
  try {
    validateEvents(events);

    const summary = prepareEventSummary(events, {
      testName: options.testName,
    });

    recordLogger.info('Starting AI-powered text case generation', {
      eventsCount: events.length,
      summary,
    });

    const userPrompt = TEXT_CASE_USER_PROMPT_TEMPLATE.replace(
      '{eventSummary}',
      JSON.stringify(summary, null, 2),
    );

    const prompt: ChatCompletionMessageParam[] = [
      { role: 'system', content: TEXT_CASE_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ];

    const screenshots = getScreenshotsForLLM(
      events,
      options.maxScreenshots || 2,
    );

    if (screenshots.length > 0) {
      prompt.push({
        role: 'user',
        content: '以下是录制过程的截图，帮助你理解上下文：',
      });

      prompt.push({
        role: 'user',
        content: screenshots.map((screenshot) => ({
          type: 'image_url',
          image_url: {
            url: screenshot,
          },
        })),
      });
    }

    const response = await callAIWithStringResponse(prompt, modelConfig);
    const content = response?.content || '';

    let textCase: TextCase;
    try {
      textCase = JSON.parse(content);
    } catch {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        textCase = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Failed to parse AI response as JSON');
      }
    }

    recordLogger.success('AI-powered text case generated successfully', {
      eventsCount: events.length,
      stepsCount: textCase.steps?.length || 0,
      textCase,
    });

    return textCase;
  } catch (error) {
    throw handleTestGenerationError(error, 'Text case', events.length);
  }
};

export const generateTextCaseStream = async (
  events: ChromeRecordedEvent[],
  options: TextCaseGenerationOptions & { onChunk: StreamingCallback },
  modelConfig: IModelConfig,
): Promise<StreamingAIResponse> => {
  try {
    validateEvents(events);

    const summary = prepareEventSummary(events, {
      testName: options.testName,
    });

    recordLogger.info('Starting AI-powered text case generation with streaming', {
      eventsCount: events.length,
      summary,
    });

    const userPrompt = TEXT_CASE_USER_PROMPT_TEMPLATE.replace(
      '{eventSummary}',
      JSON.stringify(summary, null, 2),
    );

    const prompt: ChatCompletionMessageParam[] = [
      { role: 'system', content: TEXT_CASE_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ];

    const screenshots = getScreenshotsForLLM(
      events,
      options.maxScreenshots || 2,
    );

    if (screenshots.length > 0) {
      prompt.push({
        role: 'user',
        content: '以下是录制过程的截图，帮助你理解上下文：',
      });

      prompt.push({
        role: 'user',
        content: screenshots.map((screenshot) => ({
          type: 'image_url',
          image_url: {
            url: screenshot,
          },
        })),
      });
    }

    if (options.stream && options.onChunk) {
      const response = await callAI(prompt, modelConfig, {
        stream: true,
        onChunk: options.onChunk,
      });

      return {
        content: response.content,
        isStreamed: true,
      };
    } else {
      const response = await callAIWithStringResponse(prompt, modelConfig);

      if (response?.content && typeof response.content === 'string') {
        return {
          content: response.content,
          usage: response.usage,
          isStreamed: false,
        };
      }

      throw new Error('Failed to generate text case');
    }
  } catch (error) {
    throw handleTestGenerationError(error, 'Text case', events.length);
  }
};

export const parseTextCaseFromJson = (jsonContent: string): TextCase | null => {
  try {
    const parsed = JSON.parse(jsonContent);
    if (!parsed.caseTitle || !Array.isArray(parsed.steps)) {
      return null;
    }
    return parsed as TextCase;
  } catch {
    const jsonMatch = jsonContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
};
