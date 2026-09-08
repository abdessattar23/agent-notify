import { Link, useNavigate } from "react-router-dom";
import { logout } from "@/lib/api";
import { Button } from "@/components/ui/button";

export function AccountNav({ email }: { email?: string | null }) {
  const navigate = useNavigate();

  async function onLogout() {
    await logout();
    navigate("/login");
  }

  return (
    <nav className="flex flex-wrap items-center gap-2 text-sm">
      <Button asChild variant="ghost" size="sm">
        <Link to="/">Home</Link>
      </Button>
      <Button asChild variant="ghost" size="sm">
        <Link to="/devices">Devices</Link>
      </Button>
      <Button asChild variant="ghost" size="sm">
        <Link to="/tokens">Tokens</Link>
      </Button>
      <Button asChild variant="ghost" size="sm">
        <Link to="/inbox">Inbox</Link>
      </Button>
      <span className="ml-auto text-xs text-mist/70">{email ?? "Account"}</span>
      <Button variant="secondary" size="sm" onClick={() => void onLogout()}>
        Log out
      </Button>
    </nav>
  );
}
