import { supabase } from "./supabase";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

async function getArtistAuthHeaders(): Promise<HeadersInit> {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    return { Authorization: `Bearer ${session.access_token}` };
  }
  return {};
}

export async function artistApiRequest(
  method: string,
  url: string,
  data?: unknown
): Promise<Response> {
  const authHeaders = await getArtistAuthHeaders();
  const isFormData = data instanceof FormData;

  const headers: HeadersInit = {
    ...authHeaders,
    ...(data && !isFormData ? { "Content-Type": "application/json" } : {}),
  };

  const res = await fetch(url, {
    method,
    headers,
    body: data ? (isFormData ? data : JSON.stringify(data)) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

export async function artistQueryFn<T>(url: string): Promise<T> {
  const authHeaders = await getArtistAuthHeaders();
  const res = await fetch(url, {
    headers: authHeaders,
    credentials: "include",
  });

  if (!res.ok) {
    if (res.status === 401) {
      window.location.href = "/artist/login";
    }
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}
