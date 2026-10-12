import { APIRequestContext, APIResponse } from '@playwright/test';
import { randomUUID } from 'crypto';
import { ApiCallResult, CartEntry, LoginResult, Product } from './types';

/**
 * Typed wrapper around https://api.demoblaze.com, used by API tests, perf
 * sampling and fast test data setup (registering users).
 * Passwords are base64-encoded, same as the DemoBlaze front end does.
 */
export class DemoblazeApiClient {
  constructor(private readonly request: APIRequestContext) {}

  static encodePassword(password: string): string {
    return Buffer.from(password, 'utf8').toString('base64');
  }

  private async post<T>(path: string, body: unknown): Promise<ApiCallResult<T>> {
    return this.send<T>(() => this.request.post(path, { data: body }));
  }

  private async get<T>(path: string): Promise<ApiCallResult<T>> {
    return this.send<T>(() => this.request.get(path));
  }

  /**
   * Retries once on a transport error (the request never reached the server).
   * Any server response, even an error, is returned as-is.
   */
  private async send<T>(call: () => Promise<APIResponse>, attempts = 2): Promise<ApiCallResult<T>> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      const started = performance.now();
      try {
        return { ...(await this.toResult<T>(await call(), started)), attempts: attempt };
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  }

  private async toResult<T>(response: APIResponse, started: number): Promise<Omit<ApiCallResult<T>, 'attempts'>> {
    const durationMs = Math.round(performance.now() - started);
    const text = await response.text();
    let data: unknown = text;
    try {
      data = text ? JSON.parse(text) : '';
    } catch {
      /* non-JSON body: keep raw text */
    }
    return { status: response.status(), durationMs, data: data as T };
  }

  async signUp(username: string, password: string): Promise<ApiCallResult<{ errorMessage?: string } | string>> {
    return this.post('/signup', { username, password: DemoblazeApiClient.encodePassword(password) });
  }

  async login(username: string, password: string): Promise<ApiCallResult<LoginResult>> {
    const res = await this.post<unknown>('/login', {
      username,
      password: DemoblazeApiClient.encodePassword(password),
    });
    const data: LoginResult = {};
    if (typeof res.data === 'string' && res.data.startsWith('Auth_token:')) {
      data.token = res.data.replace('Auth_token:', '').trim();
    } else if (res.data && typeof res.data === 'object' && 'errorMessage' in res.data) {
      data.errorMessage = String((res.data as { errorMessage: unknown }).errorMessage);
    }
    return { ...res, data };
  }

  async getProducts(): Promise<ApiCallResult<{ Items: Product[] }>> {
    return this.get('/entries');
  }

  async getProduct(id: number): Promise<ApiCallResult<Product>> {
    return this.post('/view', { id: String(id) });
  }

  async getProductsByCategory(cat: 'phone' | 'notebook' | 'monitor'): Promise<ApiCallResult<{ Items: Product[] }>> {
    return this.post('/bycat', { cat });
  }

  /** Adds a product to the cart of the user that owns the auth token. Returns the new cart entry id. */
  async addToCart(token: string, productId: number): Promise<ApiCallResult<string> & { cartEntryId: string }> {
    const cartEntryId = randomUUID();
    const res = await this.post<string>('/addtocart', { id: cartEntryId, cookie: token, prod_id: productId, flag: true });
    return { ...res, cartEntryId };
  }

  async viewCart(token: string): Promise<ApiCallResult<{ Items: CartEntry[] }>> {
    return this.post('/viewcart', { cookie: token, flag: true });
  }

  async deleteCartItem(cartEntryId: string): Promise<ApiCallResult<string>> {
    return this.post('/deleteitem', { id: cartEntryId });
  }

  /**
   * Registers a new user, throws if the API rejects it.
   * Usernames are unique per test, so "already exist" after a retry means the
   * first attempt actually landed - that counts as success.
   */
  async registerUser(username: string, password: string): Promise<void> {
    const res = await this.signUp(username, password);
    const errorMessage = typeof res.data === 'object' ? res.data?.errorMessage : undefined;
    const landedEarlier = res.attempts > 1 && /already exist/i.test(errorMessage ?? '');
    if (res.status === 200 && (!errorMessage || landedEarlier)) return;
    throw new Error(`Could not register test user "${username}": ${res.status} ${JSON.stringify(res.data)}`);
  }

  /** Logs in and returns the auth token, throwing on failure. */
  async getToken(username: string, password: string): Promise<string> {
    const res = await this.login(username, password);
    if (!res.data.token) throw new Error(`Login failed for "${username}": ${JSON.stringify(res.data)}`);
    return res.data.token;
  }
}
