import { json } from '@sveltejs/kit';

export function apiSuccess<T>(data: T, status = 200) {
  return json({ success: true, data, error: null }, { status });
}

export function apiError(message: string, status = 400) {
  return json({ success: false, data: null, error: message }, { status });
}
