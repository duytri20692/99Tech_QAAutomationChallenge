import { test as base, expect } from '@playwright/test';
import { env } from '../../config/env';
import { DemoblazeApiClient } from '../api/DemoblazeApiClient';
import { Credentials, newCredentials } from '../data/testData';
import { HomePage } from '../pages/HomePage';
import { LoginModal } from '../pages/LoginModal';
import { ProductPage } from '../pages/ProductPage';
import { CartPage } from '../pages/CartPage';
import { PlaceOrderModal } from '../pages/PlaceOrderModal';

type Fixtures = {
  // Page objects
  homePage: HomePage;
  loginModal: LoginModal;
  productPage: ProductPage;
  cartPage: CartPage;
  placeOrderModal: PlaceOrderModal;
  // API + data
  api: DemoblazeApiClient;
  /** A brand-new user registered through the API. Always isolated (empty cart). */
  newUser: Credentials;
  /** TEST_USERNAME/TEST_PASSWORD when configured, otherwise a brand-new user. */
  validUser: Credentials;
  /** `newUser`, already logged in through the UI and sitting on the home page. */
  loggedInUser: Credentials;
};

async function registerNewUser(api: DemoblazeApiClient): Promise<Credentials> {
  const user = newCredentials();
  await api.registerUser(user.username, user.password);
  return user;
}

export const test = base.extend<Fixtures>({
  homePage: async ({ page }, use) => use(new HomePage(page)),
  loginModal: async ({ page }, use) => use(new LoginModal(page)),
  productPage: async ({ page }, use) => use(new ProductPage(page)),
  cartPage: async ({ page }, use) => use(new CartPage(page)),
  placeOrderModal: async ({ page }, use) => use(new PlaceOrderModal(page)),

  api: async ({ playwright }, use) => {
    const context = await playwright.request.newContext({ baseURL: env.apiUrl });
    await use(new DemoblazeApiClient(context));
    await context.dispose();
  },

  newUser: async ({ api }, use) => use(await registerNewUser(api)),

  validUser: async ({ api }, use) => use(env.staticUser ?? (await registerNewUser(api))),

  loggedInUser: async ({ newUser, homePage, loginModal }, use) => {
    await homePage.open();
    await homePage.nav.openLogin();
    await loginModal.login(newUser.username, newUser.password);
    await homePage.nav.expectLoggedInAs(newUser.username);
    await use(newUser);
  },
});

export { expect };
