export interface Product {
  id: number;
  title: string;
  price: number;
  cat: string;
  desc: string;
  img: string;
}

export interface CartEntry {
  id: string;
  cookie: string;
  prod_id: number;
}

export interface ApiCallResult<T> {
  status: number;
  durationMs: number;
  data: T;
  /** How many sends it took; above 1 means an earlier one failed in transport. */
  attempts: number;
}

export interface LoginResult {
  token?: string;
  errorMessage?: string;
}
