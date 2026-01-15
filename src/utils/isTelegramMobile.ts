export function isTelegramMobile(): boolean {
  if (typeof window === "undefined") return false;

  const tg = (window as any).Telegram?.WebApp;
  if (!tg) return false;

  return tg.platform === "android" || tg.platform === "ios";
}
