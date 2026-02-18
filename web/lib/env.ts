function firstDefined(names: string[]) {
  for (const name of names) {
    const value = process.env[name];
    if (value) {
      return value;
    }
  }
  return '';
}

function requiredAny(names: string[]) {
  const value = firstDefined(names);
  if (!value) {
    throw new Error(`Missing required env var. Provide one of: ${names.join(', ')}`);
  }
  return value;
}

export const API_BASE_URL = requiredAny(['API_BASE_URL', 'PUBLIC_PO_API_BASE', 'NEXT_PUBLIC_API_BASE_URL']).replace(/\/$/, '');
export const NEXT_PUBLIC_API_BASE_URL = firstDefined(['NEXT_PUBLIC_API_BASE_URL', 'PUBLIC_PO_API_BASE', 'API_BASE_URL']).replace(/\/$/, '');
