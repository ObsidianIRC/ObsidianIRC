import { useEffect, useRef, useState } from "react";

/**
 * Deep equality check for objects and arrays
 */
function deepEqual(obj1: unknown, obj2: unknown): boolean {
  if (obj1 === obj2) return true;

  if (
    typeof obj1 !== "object" ||
    typeof obj2 !== "object" ||
    obj1 === null ||
    obj2 === null
  ) {
    return false;
  }

  const keys1 = Object.keys(obj1 as object);
  const keys2 = Object.keys(obj2 as object);

  if (keys1.length !== keys2.length) return false;

  for (const key of keys1) {
    const val1 = (obj1 as Record<string, unknown>)[key];
    const val2 = (obj2 as Record<string, unknown>)[key];

    const areObjects = isObject(val1) && isObject(val2);
    if (
      (areObjects && !deepEqual(val1, val2)) ||
      (!areObjects && val1 !== val2)
    ) {
      return false;
    }
  }

  return true;
}

function isObject(obj: unknown): obj is Record<string, unknown> {
  return obj !== null && typeof obj === "object" && !Array.isArray(obj);
}

/**
 * Hook to track unsaved changes in forms/settings
 * @param currentValues - Current form values
 * @param isOpen - Whether the modal/form is open (resets original values when opened)
 * @returns Object with hasChanges boolean and reset function
 *
 * @example
 * ```tsx
 * const { hasChanges, reset } = useUnsavedChanges(
 *   { name, email, age },
 *   isModalOpen
 * );
 *
 * <button disabled={!hasChanges}>Save</button>
 * <button onClick={reset}>Reset</button>
 * ```
 */
export function useUnsavedChanges<T extends Record<string, unknown>>(
  currentValues: T,
  isOpen: boolean,
) {
  const [originalValues, setOriginalValues] = useState<T | null>(null);
  const isFirstOpen = useRef(true);

  // Store original values when modal first opens
  useEffect(() => {
    if (isOpen && isFirstOpen.current) {
      // Delay capturing original values to ensure all initialization is complete
      const timeoutId = setTimeout(() => {
        setOriginalValues(structuredClone(currentValues));
      }, 0);
      isFirstOpen.current = false;
      return () => clearTimeout(timeoutId);
    }

    // Reset on close
    if (!isOpen) {
      isFirstOpen.current = true;
      setOriginalValues(null);
    }
  }, [isOpen, currentValues]);

  // Check if current values differ from original
  const hasChanges = originalValues
    ? !deepEqual(currentValues, originalValues)
    : false;

  // Reset current values to original
  const reset = () => {
    if (originalValues) {
      // This doesn't actually reset the values, just the tracking
      // The component using this hook needs to handle the actual reset
      setOriginalValues(structuredClone(currentValues));
    }
  };

  return {
    hasChanges,
    reset,
    originalValues,
  };
}
