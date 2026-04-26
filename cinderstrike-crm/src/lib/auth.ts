export function isAuthorized(request: Request) {
  const adminKey = process.env.CRM_ADMIN_KEY;
  if (!adminKey) return true;

  const header = request.headers.get('x-crm-admin-key');
  if (header && header === adminKey) return true;

  const auth = request.headers.get('authorization');
  if (auth === `Bearer ${adminKey}`) return true;

  return false;
}
