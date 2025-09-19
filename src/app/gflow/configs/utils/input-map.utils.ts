import { JsonValue } from '../../core/gflow.types';

export const flattenInputKeys = (value: JsonValue | unknown, base = ''): string[] => {
  const result: string[] = [];

  const walk = (current: unknown, prefix: string) => {
    if (current === null || current === undefined) {
      result.push(prefix || '$');
      return;
    }

    if (Array.isArray(current)) {
      result.push(prefix || '$');
      return;
    }

    if (typeof current === 'object') {
      const entries = Object.entries(current as Record<string, unknown>);
      if (!entries.length) {
        result.push(prefix || '$');
        return;
      }
      for (const [key, child] of entries) {
        const next = prefix ? `${prefix}.${key}` : key;
        walk(child, next);
      }
      return;
    }

    result.push(prefix || '$');
  };

  walk(value, base);
  return Array.from(new Set(result)).sort();
};
