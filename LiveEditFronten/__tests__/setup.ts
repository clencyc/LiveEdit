import '@testing-library/jest-dom';

// Provide a Jest compatibility alias so existing tests using `jest.mock` and `jest.fn` work seamlessly under Vitest
if (typeof (globalThis as any).jest === 'undefined' && typeof (globalThis as any).vi !== 'undefined') {
  (globalThis as any).jest = (globalThis as any).vi;
}
