/**
 * Catalogue entries used by the tests. Only stable identifiers (id + title) are
 * stored; prices are always read from the application at runtime so tests do
 * not break when the shop changes a price.
 */
export interface ProductRef {
  id: number;
  title: string;
  category: 'Phones' | 'Laptops' | 'Monitors';
}

export const Products = {
  samsungGalaxyS6: { id: 1, title: 'Samsung galaxy s6', category: 'Phones' },
  nokiaLumia1520: { id: 2, title: 'Nokia lumia 1520', category: 'Phones' },
  sonyVaioI5: { id: 8, title: 'Sony vaio i5', category: 'Laptops' },
} as const satisfies Record<string, ProductRef>;
