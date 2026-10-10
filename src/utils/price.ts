/** Extracts the first numeric amount from strings such as "$360 *includes tax" or "360 USD". */
export function parseAmount(text: string | null | undefined): number {
  const match = (text ?? '').replace(/,/g, '').match(/(\d+(?:\.\d+)?)/);
  if (!match) throw new Error(`Could not parse an amount from "${text}"`);
  return Number(match[1]);
}

export const sum = (values: number[]): number => values.reduce((acc, v) => acc + v, 0);
