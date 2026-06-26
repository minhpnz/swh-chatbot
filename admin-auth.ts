export function checkAdminPassword(provided: string | null): boolean {
  const expected = process.env.SWH_ADMIN_PASSWORD;
  if (!expected || !provided) return false;
  return provided === expected;
}

export function readAdminPassword(request: Request): string | null {
  const header = request.headers.get('x-swh-admin');
  if (header) return header;
  const auth = request.headers.get('authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}
