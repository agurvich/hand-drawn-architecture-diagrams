import '@testing-library/jest-dom/vitest'

/**
 * jsdom gaps that tldraw hits on mount.
 *
 * SPEC-001 FR-002 names these explicitly, because without them the canvas unit
 * test fails on `image.decode is not a function` rather than on anything to do
 * with the canvas -- i.e. "it renders" would be undecidable.
 */

// 1. jsdom implements HTMLImageElement but not its decode() promise.
if (!HTMLImageElement.prototype.decode) {
  HTMLImageElement.prototype.decode = () => Promise.resolve()
}

// 2. tldraw iterates document.fonts; jsdom exposes no FontFaceSet.
if (!('fonts' in document)) {
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: {
      add: () => {},
      delete: () => {},
      forEach: () => {},
      load: () => Promise.resolve([]),
      ready: Promise.resolve(),
      [Symbol.iterator]: function* () {},
    },
  })
}

// 3. jsdom has no ResizeObserver; tldraw measures its container with one.
if (!('ResizeObserver' in globalThis)) {
  ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

// 4. tldraw reads window.matchMedia at MODULE-IMPORT time (dark mode, reduced
//    motion, coarse pointer). jsdom has no implementation, so without this the
//    failure is `window.matchMedia is not a function` raised from the import of
//    `tldraw` itself -- before any test body runs.
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList
}

// 5. jsdom has no layout, so every element measures 0x0 and tldraw renders a
//    zero-sized canvas. Give every element a real box.
Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
  configurable: true,
  value() {
    return {
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 1024,
      bottom: 768,
      width: 1024,
      height: 768,
      toJSON: () => {},
    }
  },
})
