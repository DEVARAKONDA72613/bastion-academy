// Called right after login/OTP confirmation with the theme the backend
// resolved (IST-based default, or the user's explicit override) — see
// core/theme.ts and modules/auth/service.ts on the backend.
export function applyTheme(theme: 'light' | 'dark') {
  document.documentElement.setAttribute('data-theme', theme);
  try {
    localStorage.setItem('bastion-theme', theme);
  } catch {
    // localStorage can throw in some privacy modes — theme just won't persist, not fatal.
  }
}
