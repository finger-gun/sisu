import { describe, it, expect } from 'vitest';
import { expenseSchema } from '../src/schema.js';

describe('expenseSchema', () => {
  it('accepts valid expense', () => {
    const data = {
      vendor: 'Store',
      date: '2024-01-01',
      items: [{ item: 'A', category: 'Food', price: 1 }],
      total: 1,
    };
    expect(() => expenseSchema.parse(data)).not.toThrow();
  });

  it('rejects invalid expense', () => {
    const data: any = { vendor: 'Store', date: 'bad', items: [{ item: 'A', category: 'Food', price: 'nope' }], total: 'bad' };
    expect(() => expenseSchema.parse(data)).toThrow();
  });
});
