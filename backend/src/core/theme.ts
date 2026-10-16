/**
 * Per spec Section 8: login between 5:00 AM and 12:00 PM IST defaults to
 * light theme; all other times default to dark. This is only a DEFAULT —
 * users.theme_preference stores 'auto' | 'light' | 'dark', and a manual
 * override always wins (checked by the caller before using this value).
 */
export function computeDefaultThemeForNow(): 'light' | 'dark' {
  const istNow = new Date(Date.now() + 5.5 * 60 * 60 * 1000); // UTC -> IST offset
  const hourIst = istNow.getUTCHours();
  return hourIst >= 5 && hourIst < 12 ? 'light' : 'dark';
}
