import { useEffect, useRef, useState } from "react";
import type { AppView } from "../appView";
import { logout } from "../api/auth";
import type { AuthMeResponse } from "../api/auth";

type AuthUser = NonNullable<AuthMeResponse["user"]>;

interface AppShellProps {
  activeView: AppView;
  onNavigate: (view: AppView) => void;
  user?: AuthUser;
}

function textValue(value: unknown): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : "";
}

function userDisplayName(user?: AuthUser): string {
  return textValue(user?.name) || textValue(user?.email) || "Signed in";
}

function userInitials(label: string): string {
  if (label === "Signed in") {
    return "?";
  }

  const namePart = label.includes("@") ? label.split("@")[0] : label;
  const parts = namePart.trim().split(/\s+/).filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  return (parts[0]?.slice(0, 2) || "?").toUpperCase();
}

export default function AppShell({ activeView, onNavigate, user }: AppShellProps) {
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const intakeIsActive = activeView === "intakes" || activeView === "new-intake";
  const questionnairesIsActive = activeView === "questionnaires" || activeView === "questionnaire-builder";
  const displayName = userDisplayName(user);
  const initials = userInitials(displayName);

  useEffect(() => {
    if (!userMenuOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!userMenuRef.current?.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setUserMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [userMenuOpen]);

  return (
    <header className="top-shell">
      <button className="brand" type="button" aria-label="Ambient FHIR home" onClick={() => onNavigate("home")}>
        <span className="brand-mark" />
        Ambient FHIR
      </button>

      <nav className="top-nav" aria-label="Primary">
        <button
          type="button"
          aria-current={intakeIsActive ? "page" : undefined}
          onClick={() => onNavigate("intakes")}
        >
          Intake
        </button>
        <button
          type="button"
          aria-current={questionnairesIsActive ? "page" : undefined}
          onClick={() => onNavigate("questionnaires")}
        >
          Questionnaires
        </button>
      </nav>

      <span className="top-shell-spacer" />
      <div className="user-menu" ref={userMenuRef}>
        <button
          className="whoami"
          type="button"
          title={displayName}
          aria-haspopup="menu"
          aria-expanded={userMenuOpen}
          onClick={() => setUserMenuOpen((open) => !open)}
        >
          <span className="avatar">{initials}</span>
          <span className="whoami-name">{displayName}</span>
        </button>

        {userMenuOpen && (
          <div className="user-menu-popover" role="menu" aria-label="User menu">
            <div className="user-menu-label">{displayName}</div>
            <button className="user-menu-action" type="button" role="menuitem" onClick={logout}>
              Logout
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
