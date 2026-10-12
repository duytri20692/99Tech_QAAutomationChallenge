import { test, expect } from '../../src/fixtures';
import { Messages } from '../../src/data/messages';
import { Credentials, MaliciousInput, veryLongUsername } from '../../src/data/testData';

/**
 * Login feature - see docs/DemoBlaze_Test_Cases.xlsx, sheet "Login" (TC_LOGIN_*).
 */
test.describe('Login', () => {
  test.beforeEach(async ({ homePage }) => {
    await homePage.open();
    await homePage.nav.openLogin();
  });

  test('TC_LOGIN_003 user can log in with valid credentials', { tag: ['@smoke', '@regression'] }, async ({
    homePage,
    loginModal,
    validUser,
  }) => {
    await loginModal.login(validUser.username, validUser.password);
    await homePage.nav.expectLoggedInAs(validUser.username);
  });

  test('TC_LOGIN_002 login modal shows the expected fields and masks the password', { tag: '@regression' }, async ({
    loginModal,
  }) => {
    await loginModal.waitUntilOpen();
    await expect(loginModal.usernameInput).toBeVisible();
    await expect(loginModal.passwordInput).toHaveAttribute('type', 'password');
    await expect(loginModal.submitButton).toBeEnabled();
    await expect(loginModal.closeButton).toBeEnabled();
  });

  test('TC_LOGIN_004 session survives a page reload', { tag: '@regression' }, async ({
    page,
    homePage,
    loginModal,
    validUser,
  }) => {
    await loginModal.login(validUser.username, validUser.password);
    await homePage.nav.expectLoggedInAs(validUser.username);
    await page.reload();
    await homePage.nav.expectLoggedInAs(validUser.username);
  });

  test('TC_LOGIN_006 user can log out', { tag: ['@smoke', '@regression'] }, async ({ homePage, loginModal, validUser }) => {
    await loginModal.login(validUser.username, validUser.password);
    await homePage.nav.expectLoggedInAs(validUser.username);
    await homePage.nav.logout();
  });

  // ---------- Negative paths (data-driven) ----------
  type NegativeCase = {
    id: string;
    title: string;
    credentials: (user: Credentials) => Credentials;
    expectedAlert: string | RegExp;
  };

  const negativeCases: NegativeCase[] = [
    {
      id: 'TC_LOGIN_008',
      title: 'wrong password',
      credentials: (u) => ({ username: u.username, password: `${u.password}x` }),
      expectedAlert: Messages.login.wrongPassword,
    },
    {
      id: 'TC_LOGIN_009',
      title: 'unregistered username',
      credentials: () => ({ username: `ghost_${Date.now()}`, password: 'whatever123' }),
      expectedAlert: Messages.login.userDoesNotExist,
    },
    {
      id: 'TC_LOGIN_010',
      title: 'empty username and password',
      credentials: () => ({ username: '', password: '' }),
      expectedAlert: Messages.login.fillOutCredentials,
    },
    {
      id: 'TC_LOGIN_011',
      title: 'empty password',
      credentials: (u) => ({ username: u.username, password: '' }),
      expectedAlert: Messages.login.fillOutCredentials,
    },
    {
      id: 'TC_LOGIN_012',
      title: 'empty username',
      credentials: (u) => ({ username: '', password: u.password }),
      expectedAlert: Messages.login.fillOutCredentials,
    },
    {
      id: 'TC_LOGIN_015',
      title: 'password with different letter case',
      credentials: (u) => ({ username: u.username, password: swapCase(u.password) }),
      expectedAlert: Messages.login.wrongPassword,
    },
    {
      id: 'TC_LOGIN_018',
      title: 'SQL injection payload',
      credentials: () => ({ username: MaliciousInput.sqlInjection, password: MaliciousInput.sqlInjection }),
      expectedAlert: new RegExp(`${Messages.login.userDoesNotExist}|${Messages.login.wrongPassword}`),
    },
  ];

  for (const c of negativeCases) {
    test(`${c.id} login is rejected for ${c.title}`, { tag: '@regression' }, async ({ homePage, loginModal, validUser }) => {
      const { username, password } = c.credentials(validUser);
      const alert = await loginModal.submitExpectingAlert(username, password);
      expect(alert).toMatch(c.expectedAlert);
      await homePage.nav.expectLoggedOut();
    });
  }

  // ---------- Edge cases ----------
  test('TC_LOGIN_016 very long username is handled gracefully', { tag: '@regression' }, async ({ homePage, loginModal }) => {
    const alert = await loginModal.submitExpectingAlert(veryLongUsername(), 'whatever123');
    expect(alert).toBe(Messages.login.userDoesNotExist);
    await homePage.nav.expectLoggedOut();
  });

  test('TC_LOGIN_019 script payload in username is not executed', { tag: '@regression' }, async ({
    page,
    homePage,
    loginModal,
  }) => {
    await loginModal.submitExpectingAlert(MaliciousInput.xss, 'whatever123');
    expect(await page.evaluate(() => (window as unknown as { __xss?: boolean }).__xss)).toBeUndefined();
    await homePage.nav.expectLoggedOut();
  });

  test('TC_LOGIN_021 closing the modal cancels login', { tag: '@regression' }, async ({ homePage, loginModal, validUser }) => {
    await loginModal.fill(validUser.username, validUser.password);
    await loginModal.close();
    await homePage.nav.expectLoggedOut();
  });
});

function swapCase(value: string): string {
  return [...value].map((ch) => (ch === ch.toUpperCase() ? ch.toLowerCase() : ch.toUpperCase())).join('');
}
