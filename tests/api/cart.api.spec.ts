import { test, expect } from '../../src/fixtures';
import { Products } from '../../src/data/products';

test.describe('API: catalogue and cart', { tag: '@api' }, () => {
  test('catalogue returns products with the expected shape', { tag: ['@smoke', '@regression'] }, async ({ api }) => {
    const res = await api.getProducts();
    expect(res.status).toBe(200);
    expect(res.data.Items.length).toBeGreaterThan(0);
    for (const product of res.data.Items) {
      expect(product).toEqual(
        expect.objectContaining({ id: expect.any(Number), title: expect.any(String), price: expect.any(Number) }),
      );
      expect(product.price).toBeGreaterThan(0);
    }
  });

  test('product details match the catalogue entry', { tag: '@regression' }, async ({ api }) => {
    const res = await api.getProduct(Products.samsungGalaxyS6.id);
    expect(res.status).toBe(200);
    expect(res.data.title).toBe(Products.samsungGalaxyS6.title);
  });

  test('add, view and delete a cart item', { tag: ['@smoke', '@regression'] }, async ({ api, newUser }) => {
    const token = await api.getToken(newUser.username, newUser.password);

    const added = await api.addToCart(token, Products.sonyVaioI5.id);
    expect(added.status).toBe(200);

    const cart = await api.viewCart(token);
    expect(cart.data.Items).toEqual([expect.objectContaining({ id: added.cartEntryId, prod_id: Products.sonyVaioI5.id })]);

    await api.deleteCartItem(added.cartEntryId);
    const after = await api.viewCart(token);
    expect(after.data.Items).toHaveLength(0);
  });

  test('a user cannot see another user\'s cart (TC_CART_016)', { tag: '@regression' }, async ({ api, newUser }) => {
    const other = { username: `${newUser.username}_b`, password: newUser.password };
    await api.registerUser(other.username, other.password);

    const tokenA = await api.getToken(newUser.username, newUser.password);
    const tokenB = await api.getToken(other.username, other.password);

    await api.addToCart(tokenA, Products.samsungGalaxyS6.id);
    const cartB = await api.viewCart(tokenB);
    expect(cartB.data.Items).toHaveLength(0);
  });
});
