const BASE_URL = '';

export async function apiFetch<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const detail = typeof body?.detail === 'string'
      ? body.detail
      : res.status === 422 ? '入力の形式や文字数を確認してください' : '処理に失敗しました';
    throw new Error(`${detail} (${res.status})`);
  }
  return res.json() as Promise<T>;
}
