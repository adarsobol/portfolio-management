import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLocalStorage } from '../useLocalStorage';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((index: number) => Object.keys(store)[index] || null),
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

describe('useLocalStorage', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  it('should return initial value when localStorage is empty', () => {
    const { result } = renderHook(() => useLocalStorage('testKey', 'defaultValue'));
    
    expect(result.current[0]).toBe('defaultValue');
  });

  it('should return stored value from localStorage', () => {
    localStorageMock.setItem('testKey', JSON.stringify('storedValue'));
    
    const { result } = renderHook(() => useLocalStorage('testKey', 'defaultValue'));
    
    expect(result.current[0]).toBe('storedValue');
  });

  it('should update localStorage when value changes', () => {
    const { result } = renderHook(() => useLocalStorage('testKey', 'initial'));
    
    act(() => {
      result.current[1]('updated');
    });
    
    expect(result.current[0]).toBe('updated');
    expect(localStorageMock.setItem).toHaveBeenCalledWith('testKey', JSON.stringify('updated'));
  });

  it('should support functional updates', () => {
    const { result } = renderHook(() => useLocalStorage('counter', 0));
    
    act(() => {
      result.current[1](prev => prev + 1);
    });
    
    expect(result.current[0]).toBe(1);
    
    act(() => {
      result.current[1](prev => prev + 5);
    });
    
    expect(result.current[0]).toBe(6);
  });

  it('should handle complex objects', () => {
    const initialObject = { name: 'Test', values: [1, 2, 3] };
    
    const { result } = renderHook(() => useLocalStorage('objectKey', initialObject));
    
    expect(result.current[0]).toEqual(initialObject);
    
    const updatedObject = { name: 'Updated', values: [4, 5, 6] };
    act(() => {
      result.current[1](updatedObject);
    });
    
    expect(result.current[0]).toEqual(updatedObject);
  });

  it('should handle arrays', () => {
    const initialArray = ['a', 'b', 'c'];
    
    const { result } = renderHook(() => useLocalStorage('arrayKey', initialArray));
    
    expect(result.current[0]).toEqual(initialArray);
    
    act(() => {
      result.current[1](prev => [...prev, 'd']);
    });
    
    expect(result.current[0]).toEqual(['a', 'b', 'c', 'd']);
  });

  it('should handle booleans', () => {
    const { result } = renderHook(() => useLocalStorage('boolKey', false));
    
    expect(result.current[0]).toBe(false);
    
    act(() => {
      result.current[1](true);
    });
    
    expect(result.current[0]).toBe(true);
  });

  it('should handle null values', () => {
    const { result } = renderHook(() => useLocalStorage<string | null>('nullKey', null));
    
    expect(result.current[0]).toBeNull();
    
    act(() => {
      result.current[1]('notNull');
    });
    
    expect(result.current[0]).toBe('notNull');
  });

  it('should use different keys independently', () => {
    const { result: result1 } = renderHook(() => useLocalStorage('key1', 'value1'));
    const { result: result2 } = renderHook(() => useLocalStorage('key2', 'value2'));
    
    expect(result1.current[0]).toBe('value1');
    expect(result2.current[0]).toBe('value2');
    
    act(() => {
      result1.current[1]('updated1');
    });
    
    expect(result1.current[0]).toBe('updated1');
    expect(result2.current[0]).toBe('value2');
  });

  it('should handle invalid JSON in localStorage gracefully', () => {
    // Directly set invalid JSON in the mock
    localStorageMock.setItem('invalidKey', 'not valid json{');
    localStorageMock.getItem = vi.fn(() => 'not valid json{');
    
    // Should fall back to initial value
    const { result } = renderHook(() => useLocalStorage('invalidKey', 'fallback'));
    
    expect(result.current[0]).toBe('fallback');
  });

  it('should maintain stable setValue reference', () => {
    const { result, rerender } = renderHook(() => useLocalStorage('stableKey', 'value'));
    
    const setValue1 = result.current[1];
    rerender();
    const setValue2 = result.current[1];
    
    expect(setValue1).toBe(setValue2);
  });
});
