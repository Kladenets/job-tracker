export type SessionRole = "owner" | "guest";

export function getGuestRedirect(pathname: string, role: SessionRole): "/inbox" | null {
  if (role === "guest" && (pathname === "/dashboard" || pathname === "/setup")) {
    return "/inbox";
  }
  return null;
}