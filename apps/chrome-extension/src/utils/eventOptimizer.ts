import Service, { ScreenshotItem } from '@midscene/core';
import type { Rect, UIContext } from '@midscene/core';
import type { RecordedEvent } from '@midscene/recorder';
import { globalModelConfigManager } from '@midscene/shared/env';
import { compositeElementInfoImg } from '@midscene/shared/img';

// Caches for element descriptions and boxed screenshots to improve performance
const MAX_CACHE_SIZE = 100;
const descriptionCache = new Map<string, string>();
const boxedScreenshotCache = new Map<string, string>();
const cacheKeyOrder: string[] = [];

// Track ongoing AI description generation requests
const ongoingDescriptionRequests = new Map<string, Promise<string>>();
const pendingCallbacks = new Map<string, (description: string) => void>();

// Debounce mechanism for AI description generation
const debounceTimeouts = new Map<string, NodeJS.Timeout>();

// Concurrency control for AI description generation
const MAX_CONCURRENT_AI_REQUESTS = 3;
let currentAIRequests = 0;
const aiRequestQueue: Array<() => void> = [];

// Helper function to acquire AI request slot
const acquireAISlot = (): Promise<void> => {
  return new Promise((resolve) => {
    if (currentAIRequests < MAX_CONCURRENT_AI_REQUESTS) {
      currentAIRequests++;
      resolve();
    } else {
      aiRequestQueue.push(() => {
        currentAIRequests++;
        resolve();
      });
    }
  });
};

// Helper function to release AI request slot
const releaseAISlot = () => {
  currentAIRequests--;
  if (aiRequestQueue.length > 0) {
    const next = aiRequestQueue.shift();
    if (next) {
      next();
    }
  }
};

// Add an item to cache with size limiting
const addToCache = (
  cache: Map<string, string>,
  key: string,
  value: string,
): void => {
  const existingIndex = cacheKeyOrder.indexOf(key);
  if (existingIndex >= 0) {
    cacheKeyOrder.splice(existingIndex, 1);
  }

  if (cache.size >= MAX_CACHE_SIZE && cacheKeyOrder.length > 0) {
    const oldestKey = cacheKeyOrder.shift();
    if (oldestKey) {
      descriptionCache.delete(oldestKey);
      boxedScreenshotCache.delete(oldestKey);
    }
  }

  cache.set(key, value);
  cacheKeyOrder.push(key);
};

// Clear all caches and ongoing operations
export const clearDescriptionCache = (): void => {
  descriptionCache.clear();
  boxedScreenshotCache.clear();
  cacheKeyOrder.length = 0;
  ongoingDescriptionRequests.clear();
  pendingCallbacks.clear();
  debounceTimeouts.forEach((timeout) => clearTimeout(timeout));
  debounceTimeouts.clear();
  console.log('All caches and ongoing operations cleared');
};

// Generate fallback description for events when AI fails
export const generateFallbackDescription = (): string => {
  return 'failed to generate element description';
};

// Check if event has valid rect information
const hasValidRect = (event: RecordedEvent): boolean => {
  return Boolean(
    ((event.elementRect?.left || event.elementRect?.top) &&
      event.elementRect?.width &&
      event.elementRect?.height) ||
      event.elementRect?.x ||
      event.elementRect?.y,
  );
};

// Extract rect from event, prioritizing full rect properties over x/y coordinates
const extractRect = (event: RecordedEvent): Rect | [number, number] | null => {
  if (!event.elementRect) {
    return null;
  }

  // Priority 1: Full rect with width/height
  if (
    event.elementRect.width &&
    event.elementRect.height &&
    (event.elementRect.left !== undefined ||
      event.elementRect.top !== undefined)
  ) {
    return {
      left: event.elementRect.left || 0,
      top: event.elementRect.top || 0,
      width: event.elementRect.width,
      height: event.elementRect.height,
    };
  }

  // Priority 2: x/y coordinates (return as tuple for point-based operations)
  if (event.elementRect.x !== undefined && event.elementRect.y !== undefined) {
    return [event.elementRect.x, event.elementRect.y];
  }

  return null;
};

// Generate AI description asynchronously
export const generateAIDescription = async (
  event: RecordedEvent,
  hashId: string,
): Promise<string> => {
  console.log('[generateAIDescription] Starting for event:', {
    type: event.type,
    hashId,
    hasScreenshot: !!event.screenshotBefore,
    hasValidRect: hasValidRect(event),
    elementRect: event.elementRect,
  });

  if (!event.screenshotBefore || !hasValidRect(event)) {
    console.warn('[generateAIDescription] Missing screenshot or valid rect, using fallback', {
      hasScreenshot: !!event.screenshotBefore,
      hasValidRect: hasValidRect(event),
    });
    return generateFallbackDescription();
  }

  if (ongoingDescriptionRequests.has(hashId)) {
    console.log('[generateAIDescription] Returning existing promise for hashId:', hashId);
    return ongoingDescriptionRequests.get(hashId)!;
  }

  // New addition: describe call with retry
  async function describeWithRetry(
    service: Service,
    rect: Rect | [number, number],
    maxRetries = 3,
  ) {
    let lastError;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[generateAIDescription] Attempt ${attempt}/${maxRetries} to call AI describe`);
        const modelConfig = globalModelConfigManager.getModelConfig('default');
        console.log('[generateAIDescription] Model config:', {
          modelFamily: modelConfig.modelFamily,
        });
        const result = await service.describe(rect, modelConfig);
        console.log('[generateAIDescription] AI describe succeeded:', result);
        return result;
      } catch (err) {
        lastError = err;
        console.error(`[generateAIDescription] Attempt ${attempt} failed:`, err);
        if (attempt < maxRetries) {
          console.log('[generateAIDescription] Retrying in 200ms...');
          await new Promise((res) => setTimeout(res, 200));
        }
      }
    }
    throw lastError;
  }

  const descriptionPromise = (async () => {
    try {
      // Acquire AI request slot
      await acquireAISlot();
      
      // Create a proper UIContext using ScreenshotItem
      const screenshot = ScreenshotItem.create(event.screenshotBefore as string);
      const mockContext: UIContext = {
        screenshot,
        size: { width: event.pageInfo.width, height: event.pageInfo.height },
      } as UIContext;

      console.log('[generateAIDescription] Creating Service with context:', {
        screenshotLength: event.screenshotBefore?.length,
        pageSize: mockContext.size,
      });

      const service = new Service(mockContext);
      const rect = extractRect(event);
      if (!rect) {
        throw new Error('No valid rect found');
      }

      console.log('[generateAIDescription] Extracted rect:', rect);

      // Modify it to a call with retry
      const { description } = await describeWithRetry(service, rect, 3);
      console.log('[generateAIDescription] Final description:', description);
      addToCache(descriptionCache, hashId, description);
      return description;
    } catch (error) {
      console.error('[generateAIDescription] Failed to generate AI description:', error);
      const fallbackDescription = generateFallbackDescription();
      addToCache(descriptionCache, hashId, fallbackDescription);
      return fallbackDescription;
    } finally {
      // Release AI request slot
      releaseAISlot();
      ongoingDescriptionRequests.delete(hashId);
      pendingCallbacks.delete(hashId);
    }
  })();

  ongoingDescriptionRequests.set(hashId, descriptionPromise);
  return descriptionPromise;
};

// Generate boxed image for event
export const generateBoxedImage = async (
  event: RecordedEvent,
): Promise<string | undefined> => {
  try {
    if (!event.screenshotBefore) {
      return undefined;
    }

    const hashId = event.hashId;
    if (boxedScreenshotCache.has(hashId)) {
      return boxedScreenshotCache.get(hashId);
    }

    const elementsPositionInfo = [];
    if (hasValidRect(event)) {
      const rect = extractRect(event);
      if (rect) {
        const displayRect = Array.isArray(rect)
          ? { left: rect[0], top: rect[1], width: 4, height: 4 }
          : rect;
        elementsPositionInfo.push({
          rect: displayRect,
          indexId: Array.isArray(rect) ? undefined : 1,
        });
      }
    }

    const boxedImageBase64 = await compositeElementInfoImg({
      inputImgBase64: event.screenshotBefore,
      size: { width: event.pageInfo.width, height: event.pageInfo.height },
      elementsPositionInfo,
      borderThickness: 3,
      annotationPadding: 2,
    });

    if (
      event.elementRect?.width &&
      event.elementRect?.height &&
      event.elementRect.width > 0 &&
      event.elementRect.height > 0
    ) {
      addToCache(boxedScreenshotCache, hashId, boxedImageBase64);
    }

    return boxedImageBase64;
  } catch (error) {
    console.error(
      '[generateBoxedImage] Failed to generate boxed image:',
      error,
    );
    return undefined;
  }
};

// Main function to optimize event with AI description and boxed image
export const optimizeEvent = async (
  event: RecordedEvent,
  updateCallback: (updatedEvent: RecordedEvent) => void,
): Promise<RecordedEvent> => {
  try {
    const boxedImageBase64 = await generateBoxedImage(event);
    if (boxedImageBase64) {
      event.screenshotWithBox = boxedImageBase64;
    }

    const hashId = event.hashId;
    const eventWithDescription = { ...event };

    // Set initial loading state
    eventWithDescription.elementDescription = 'AI is analyzing element...';
    eventWithDescription.descriptionLoading = true;
    updateCallback(eventWithDescription);

    // Check cache first
    if (descriptionCache.has(hashId)) {
      const cachedDescription = descriptionCache.get(hashId)!;
      eventWithDescription.elementDescription = cachedDescription;
      eventWithDescription.descriptionLoading = false;
      updateCallback(eventWithDescription);
      return eventWithDescription;
    }

    // Generate description with debouncing
    generateAIDescription(event, hashId)
      .then((description) => {
        updateCallback({
          ...event,
          elementDescription: description,
          descriptionLoading: false,
        });
      })
      .catch((error) => {
        console.error(
          '[optimizeEvent] Error in AI description generation:',
          error,
        );
        updateCallback({
          ...event,
          elementDescription: generateFallbackDescription(),
          descriptionLoading: false,
        });
      });
    return eventWithDescription;
  } catch (error) {
    console.error('[optimizeEvent] Error processing event:', error);
    return {
      ...event,
      elementDescription: generateFallbackDescription(),
      descriptionLoading: false,
    };
  }
};
