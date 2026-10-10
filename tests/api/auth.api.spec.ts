import { test, expect } from '../../src/fixtures';
import { Messages } from '../../src/data/messages';
import { newCredentials } from '../../src/data/testData';

test.describe('API: authentication', { tag: '@api' }, () => {
  test('sign up then log in returns an auth token', { tag: ['@smoke', '@regression'] }, async ({ api }) => {
    const user = newCredentials('api');
    const signUp = await api.signUp(user.username, user.password);
    expect(signUp.status).toBe(200);

    const login = await api.login(user.username, user.password);
    expect(login.status).toBe(200);
    expect(login.data.token).toBeTruthy();
    expect(login.data.errorMessage).toBeUndefined();
  });

  test('sign up with an existing username is rejected', { tag: '@regression' }, async ({ api, newUser }) => {
    const res = await api.signUp(newUser.username, 'another-password');
    expect(res.data).toMatchObject({ errorMessage: Messages.signUp.userAlreadyExists });
  });

  test('login with a wrong password is rejected', { tag: '@regression' }, async ({ api, newUser }) => {
    const res = await api.login(newUser.username, 'wrong-password');
    expect(res.data.token).toBeUndefined();
    expect(res.data.errorMessage).toBe(Messages.login.wrongPassword);
  });

  test('login with an unknown user is rejected', { tag: '@regression' }, async ({ api }) => {
    const res = await api.login(`ghost_${Date.now()}`, 'whatever');
    expect(res.data.token).toBeUndefined();
    expect(res.data.errorMessage).toBe(Messages.login.userDoesNotExist);
  });
});
