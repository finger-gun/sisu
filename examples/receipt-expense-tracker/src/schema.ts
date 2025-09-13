import { z } from 'zod';

function parseAmount(input: string): number {
  const s = input.trim();
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  let t = s.replace(/[^0-9,.-]/g, '');
  if (hasComma && !hasDot) {
    // Treat comma as decimal separator when there's no dot
    t = t.replace(/,/g, '.');
  } else {
    // Otherwise commas are thousands separators; drop them
    t = t.replace(/,/g, '');
  }
  // Normalize multiple leading signs
  t = t.replace(/(?!^)-/g, '');
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

const numberLoose = z.preprocess((v) => {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = parseAmount(v);
    return Number.isFinite(n) ? n : v;
  }
  return v;
}, z.number());

const numberLooseNonneg = z.preprocess((v) => {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = parseAmount(v);
    return Number.isFinite(n) ? n : v;
  }
  return v;
}, z.number().nonnegative());

export const expenseItemSchema = z.object({
  item: z.string(),
  category: z.string(),
  // Allow discounts or returns as negative; coerce from strings like "$12.34" or "-1,23"
  price: numberLoose,
});

export const expenseSchema = z.object({
  vendor: z.string(),
  date: z.string(),
  items: z.array(expenseItemSchema),
  // Coerce total from strings; keep nonnegative invariant
  total: numberLooseNonneg,
});

export type Expense = z.infer<typeof expenseSchema>;
