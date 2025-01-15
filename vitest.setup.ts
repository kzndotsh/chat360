import { expect, afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';
import { config } from 'dotenv';

// Load .env file variables into process.env
config();

// Extend Vitest's expect with Testing Library's matchers
Object.keys(matchers).forEach((key) => {
  const matcher = matchers[key as keyof typeof matchers];
  if (typeof matcher === 'function') {
    expect.extend({ [key]: matcher });
  }
});

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  clear: vi.fn(),
  removeItem: vi.fn(),
  length: 0,
  key: vi.fn(),
};

global.localStorage = localStorageMock;

// Mock window.requestAnimationFrame
global.requestAnimationFrame = vi.fn().mockImplementation((callback) => {
  return setTimeout(() => callback(Date.now()), 0);
});

global.cancelAnimationFrame = vi.fn().mockImplementation((id) => {
  clearTimeout(id);
});

// Clean up after each test
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
