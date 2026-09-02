// Config admin email - all admin notifications go here
// Used as a fallback / hardcoded destination for admin notifications
export const ADMIN_EMAILS = [
  'boutiti.mehdi@gmail.com',
  // Add more admin emails here if needed
];

/**
 * Get all admin email destinations (DB admins + hardcoded fallback)
 */
export function getAdminEmailsFromConfig(): string[] {
  return ADMIN_EMAILS;
}
