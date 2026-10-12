import { test, expect } from '../../src/fixtures';
import { Products } from '../../src/data/products';
import { Messages } from '../../src/data/messages';
import { validOrder } from '../../src/data/testData';

/**
 * DEMO SCENARIO: log in with valid credentials -> add to cart -> place order.
 * Plus the order-form edge cases (TC_CART_019+ in the test case workbook).
 */
test.describe('Checkout', () => {
  test('TC_CART_020 E2E: logged-in user adds a product to the cart and places an order', { tag: ['@smoke', '@regression'] }, async ({
    homePage,
    loginModal,
    validUser,
    productPage,
    cartPage,
  }) => {
    const order = validOrder();
    let price = 0;

    await test.step('Log in with valid credentials', async () => {
      await homePage.open();
      await homePage.nav.openLogin();
      await loginModal.login(validUser.username, validUser.password);
      await homePage.nav.expectLoggedInAs(validUser.username);
    });

    await test.step('Open a product and add it to the cart', async () => {
      await homePage.openProduct(Products.samsungGalaxyS6.title);
      expect(await productPage.getTitle()).toBe(Products.samsungGalaxyS6.title);
      price = await productPage.getPrice();
      await productPage.addToCart();
    });

    await test.step('Verify the cart content and total', async () => {
      await homePage.nav.openCart();
      await expect(cartPage.row(Products.samsungGalaxyS6.title)).toBeVisible();
      const items = await cartPage.getItems();
      expect(items.filter((i) => i.title === Products.samsungGalaxyS6.title).every((i) => i.price === price)).toBe(true);
      await cartPage.expectTotalMatchesItems();
    });

    const cartTotal = await cartPage.getTotal();

    await test.step('Place the order and verify the confirmation', async () => {
      const modal = await cartPage.openPlaceOrder();
      await modal.fill(order);
      const confirmation = await modal.purchase();
      const details = await confirmation.readDetails();

      expect(details.id, 'order id').toMatch(/^\d+$/);
      expect(details.amount, 'charged amount equals cart total').toBe(cartTotal);
      expect(details.cardNumber).toBe(order.card);
      expect(details.name).toBe(order.name);
      expect(details.date).toMatch(/^\d{1,2}\/\d{1,2}\/\d{4}$/);
      await test.info().attach('order-confirmation.txt', { body: details.raw, contentType: 'text/plain' });

      await confirmation.confirm();
    });

    await test.step('Cart is emptied after the purchase', async () => {
      await cartPage.open();
      await cartPage.expectItemCount(0);
    });
  });

  test('TC_CART_021 order succeeds with only the mandatory fields (name and card)', { tag: '@regression' }, async ({
    loggedInUser: _user,
    productPage,
    cartPage,
  }) => {
    await productPage.openById(Products.samsungGalaxyS6.id);
    await productPage.addToCart();
    await cartPage.open();
    await cartPage.expectItemCount(1);

    const modal = await cartPage.openPlaceOrder();
    await modal.fill({ name: 'Min Fields', card: '4111111111111111' });
    const confirmation = await modal.purchase();
    expect((await confirmation.readDetails()).name).toBe('Min Fields');
  });

  const missingFieldCases = [
    { id: 'TC_CART_022', title: 'name is empty', details: validOrder({ name: '' }) },
    { id: 'TC_CART_023', title: 'credit card is empty', details: validOrder({ card: '' }) },
    { id: 'TC_CART_024', title: 'all fields are empty', details: {} },
  ];

  for (const c of missingFieldCases) {
    test(`${c.id} order is rejected when ${c.title}`, { tag: '@regression' }, async ({
      loggedInUser: _user,
      productPage,
      cartPage,
    }) => {
      await productPage.openById(Products.samsungGalaxyS6.id);
      await productPage.addToCart();
      await cartPage.open();
      await cartPage.expectItemCount(1);

      const modal = await cartPage.openPlaceOrder();
      await modal.fill(c.details);
      const alert = await modal.purchaseExpectingAlert();

      expect(alert).toBe(Messages.order.fillOutNameAndCard);
      await expect(modal.confirmation.root).toBeHidden();
      await expect(modal.root).toBeVisible();
      await modal.close();
      await cartPage.expectItemCount(1);
    });
  }

  test('TC_CART_030 closing the order modal keeps the cart unchanged', { tag: '@regression' }, async ({
    loggedInUser: _user,
    productPage,
    cartPage,
  }) => {
    await productPage.openById(Products.samsungGalaxyS6.id);
    await productPage.addToCart();
    await cartPage.open();
    await cartPage.expectItemCount(1);

    const modal = await cartPage.openPlaceOrder();
    await modal.fill(validOrder());
    await modal.close();

    await cartPage.expectItemCount(1);
  });

  test('TC_CART_026 placing an order with an empty cart should be blocked', { tag: ['@regression', '@known-defect'] }, async ({
    page,
    loggedInUser: _user,
    cartPage,
  }) => {
    test.info().annotations.push({ type: 'issue', description: 'DEF-02: an empty cart can be purchased (Amount: 0 USD)' });
    // Expected to fail until DEF-02 is fixed; Playwright will flag it as "unexpectedly passed" once the app is fixed.
    test.fail(true, 'Known defect DEF-02');

    await cartPage.open();
    await cartPage.expectItemCount(0);
    const modal = await cartPage.openPlaceOrder();
    await modal.fill(validOrder());
    await modal.purchaseButton.click();

    // Long timeout: a timeout also passes the assertion, so a slow dialog
    // must not look like a rejected order.
    const outcome = await Promise.race([
      modal.confirmation.root.waitFor({ state: 'visible', timeout: 30_000 }).then(() => 'order-confirmed' as const),
      page.waitForEvent('dialog', { timeout: 30_000 }).then(async (d) => {
        await d.accept();
        return 'rejected-with-alert' as const;
      }),
    ]).catch(() => 'no-confirmation' as const);

    expect(outcome, 'an order must not be placed for an empty cart').not.toBe('order-confirmed');
  });
});
