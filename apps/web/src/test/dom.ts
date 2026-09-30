import { act } from '@testing-library/react';

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];
  readonly elements = new Set<Element>();

  constructor(readonly callback: IntersectionObserverCallback) {
    MockIntersectionObserver.instances.push(this);
  }

  observe(element: Element) {
    this.elements.add(element);
  }

  unobserve(element: Element) {
    this.elements.delete(element);
  }

  disconnect() {
    this.elements.clear();
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

class MockResizeObserver {
  static instances: MockResizeObserver[] = [];
  readonly elements = new Set<Element>();

  constructor(readonly callback: ResizeObserverCallback) {
    MockResizeObserver.instances.push(this);
  }

  observe(element: Element) {
    this.elements.add(element);
  }

  unobserve(element: Element) {
    this.elements.delete(element);
  }

  disconnect() {
    this.elements.clear();
  }
}

export function installDomMocks(): void {
  // Node-environment suites (e.g. highlight) have no DOM to mock.
  if (typeof window === 'undefined') return;
  globalThis.IntersectionObserver =
    MockIntersectionObserver as unknown as typeof IntersectionObserver;
  globalThis.ResizeObserver = MockResizeObserver;
  Element.prototype.scrollTo = function scrollTo(
    this: Element,
    options?: ScrollToOptions | number,
    y?: number,
  ) {
    if (typeof options === 'number') this.scrollTop = y ?? 0;
    else if (options?.top !== undefined) this.scrollTop = options.top;
    this.dispatchEvent(new Event('scroll'));
  };
  Element.prototype.scrollIntoView = function scrollIntoView() {
    // jsdom has no layout, so there is nothing to scroll.
  };
  HTMLDialogElement.prototype.showModal = function showModal(
    this: HTMLDialogElement,
  ) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event('close'));
  };
}

export function resetObservers(): void {
  MockIntersectionObserver.instances = [];
  MockResizeObserver.instances = [];
}

export function triggerResize(): void {
  act(() => {
    for (const observer of MockResizeObserver.instances) {
      if (observer.elements.size === 0) continue;
      observer.callback([], observer);
    }
  });
}

export function triggerIntersection(
  target: Element,
  init: { isIntersecting: boolean; top?: number; rootBottom?: number },
): void {
  act(() => {
    for (const observer of MockIntersectionObserver.instances) {
      if (!observer.elements.has(target)) continue;
      const entry = {
        target,
        isIntersecting: init.isIntersecting,
        intersectionRatio: init.isIntersecting ? 1 : 0,
        boundingClientRect: { top: init.top ?? 0 } as DOMRectReadOnly,
        rootBounds: { bottom: init.rootBottom ?? 300 } as DOMRectReadOnly,
        intersectionRect: {} as DOMRectReadOnly,
        time: 0,
      } as IntersectionObserverEntry;
      observer.callback([entry], observer as unknown as IntersectionObserver);
    }
  });
}

export function mockScrollGeometry(
  element: HTMLElement,
  initial: { scrollHeight: number; clientHeight: number; scrollTop?: number },
): { scrollHeight: number; clientHeight: number; scrollTop: number } {
  const geometry = { scrollTop: 0, ...initial };
  Object.defineProperties(element, {
    scrollHeight: { configurable: true, get: () => geometry.scrollHeight },
    clientHeight: { configurable: true, get: () => geometry.clientHeight },
    scrollTop: {
      configurable: true,
      get: () => geometry.scrollTop,
      set: (value: number) => {
        geometry.scrollTop = value;
      },
    },
  });
  return geometry;
}

export function getScrollContainer(): HTMLElement {
  const element = document.querySelector<HTMLElement>(
    '[data-scroll-container]',
  );
  if (!element) throw new Error('Scroll container is not rendered.');
  return element;
}
