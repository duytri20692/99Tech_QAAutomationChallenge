import { test, expect } from '../../src/fixtures';
import { Products } from '../../src/data/products';
import { sum } from '../../src/utils/price';

/**
 * Cart feature - see docs/DemoBlaze_Test_Cases.xlsx, sheet "Cart" (TC_CART_*).
 * Every test that needs a user gets a freshly registered one, so carts never leak between tests.
 */
test.describe('Cart', () => {
  test('TC_CART_001 guest can add a product and see it in the cart', { tag: ['@smoke', '@regression'] }, async ({
    homePage,
    productPage,
    cartPage,
  }) => {
    // Only index.html issues the guest cart cookie. Opening prod.html directly
    // leaves it empty, and DemoBlaze then serves every guest the same cart.
    await homePage.open();
    await productPage.openById(Products.samsungGalaxyS6.id);
    const price = await productPage.getPrice();
    await productPage.addToCart();

    await cartPage.open();
    await cartPage.expectItemCount(1);
    expect(await cartPage.getItems()).toEqual([{ title: Products.samsungGalaxyS6.title, price }]);
    await cartPage.expectTotalMatchesItems();
  });

  test('TC_CART_002 product opened from the home page can be added by a logged-in user', { tag: '@regression' }, async ({
    loggedInUser: _user,
    homePage,
    productPage,
    cartPage,
  }) => {
    await homePage.openProduct(Products.nokiaLumia1520.title);
    expect(await productPage.getTitle()).toBe(Products.nokiaLumia1520.title);
    await productPage.addToCart();

    await homePage.nav.openCart();
    await cartPage.expectItemCount(1);
    await expect(cartPage.row(Products.nokiaLumia1520.title)).toBeVisible();
  });

  test('TC_CART_004 multiple different products are listed and the total is their sum', { tag: '@regression' }, async ({
    loggedInUser: _user,
    productPage,
    cartPage,
  }) => {
    const added = [Products.samsungGalaxyS6, Products.sonyVaioI5];
    const expectedPrices: number[] = [];
    for (const product of added) {
      await productPage.openById(product.id);
      expectedPrices.push(await productPage.getPrice());
      await productPage.addToCart();
    }

    await cartPage.open();
    await cartPage.expectItemCount(added.length);
    const total = await cartPage.expectTotalMatchesItems();
    expect(total).toBe(sum(expectedPrices));
  });

  test('TC_CART_005 adding the same product twice should show a single row with quantity 2', { tag: ['@regression', '@known-defect'] }, async ({
    loggedInUser: _user,
    productPage,
    cartPage,
  }) => {
    test.info().annotations.push({ type: 'issue', description: 'DEF-01: the same product added twice creates duplicate rows (no quantity)' });
    test.fail(true, 'Known defect DEF-01');

    await productPage.openById(Products.samsungGalaxyS6.id);
    const price = await productPage.getPrice();
    await productPage.addToCart();
    await productPage.addToCart();

    await cartPage.open();
    // The total is right either way; the row count is where the defect shows.
    await expect(cartPage.total).toHaveText(String(price * 2));
    await cartPage.expectItemCount(1);
  });

  test('TC_CART_009 a new user starts with an empty cart', { tag: '@regression' }, async ({ loggedInUser: _user, cartPage }) => {
    await cartPage.open();
    await cartPage.expectItemCount(0);
  });

  test('TC_CART_010 deleting an item removes it and updates the total', { tag: ['@smoke', '@regression'] }, async ({
    loggedInUser: _user,
    productPage,
    cartPage,
  }) => {
    for (const product of [Products.samsungGalaxyS6, Products.nokiaLumia1520]) {
      await productPage.openById(product.id);
      await productPage.addToCart();
    }
    await cartPage.open();
    await cartPage.expectItemCount(2);

    await cartPage.deleteItem(Products.nokiaLumia1520.title);

    await expect(cartPage.row(Products.nokiaLumia1520.title)).toHaveCount(0);
    await expect(cartPage.row(Products.samsungGalaxyS6.title)).toHaveCount(1);
    await cartPage.expectTotalMatchesItems();
  });

  test('TC_CART_011 deleting one of two identical items removes only one', { tag: '@regression' }, async ({
    loggedInUser: _user,
    productPage,
    cartPage,
  }) => {
    await productPage.openById(Products.sonyVaioI5.id);
    await productPage.addToCart();
    await productPage.addToCart();
    await cartPage.open();
    await cartPage.expectItemCount(2);

    await cartPage.deleteItem(Products.sonyVaioI5.title);
    await cartPage.expectItemCount(1);
  });

  test('TC_CART_013 cart content survives a page reload', { tag: '@regression' }, async ({
    page,
    loggedInUser: _user,
    productPage,
    cartPage,
  }) => {
    await productPage.openById(Products.samsungGalaxyS6.id);
    await productPage.addToCart();
    await cartPage.open();
    await cartPage.expectItemCount(1);

    await page.reload();
    await cartPage.expectItemCount(1);
  });

  test('TC_CART_014 logged-in cart is restored after logout and login', { tag: '@regression' }, async ({
    loggedInUser,
    homePage,
    loginModal,
    productPage,
    cartPage,
  }) => {
    await productPage.openById(Products.samsungGalaxyS6.id);
    await productPage.addToCart();

    await homePage.open();
    await homePage.nav.logout();
    await homePage.nav.openLogin();
    await loginModal.login(loggedInUser.username, loggedInUser.password);
    await homePage.nav.expectLoggedInAs(loggedInUser.username);

    await cartPage.open();
    await cartPage.expectItemCount(1);
    await expect(cartPage.row(Products.samsungGalaxyS6.title)).toBeVisible();
  });
});
