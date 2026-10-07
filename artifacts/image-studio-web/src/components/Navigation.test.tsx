import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Navigation from "./Navigation";

const fixture = vi.hoisted(() => ({
  isAdmin: false,
  user: { email: "admin@example.com", displayName: "Admin" } as { email: string; displayName: string } | null,
  stateIndex: 0,
  setMenuOpen: vi.fn(),
  createUrl: vi.fn((path: string) => `/studio${path}`),
}));

vi.mock("react", async importOriginal => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: () => {
      fixture.stateIndex += 1;
      return [false, fixture.setMenuOpen];
    },
    useEffect: vi.fn(),
    useId: () => "navigation-test-id",
  };
});
vi.mock("wouter", () => ({
  Link: "a",
  useLocation: () => ["/", vi.fn()],
}));
vi.mock("../context/StudioContext", () => ({
  useStudio: () => ({ studioSettings: { logo: "", name: "Studio" } }),
}));
vi.mock("../hooks/useLogout", () => ({
  useLogout: () => ({ handleLogout: vi.fn() }),
}));
vi.mock("../hooks/useIsAdmin", () => ({
  useIsAdmin: () => fixture.isAdmin,
}));
vi.mock("@/context/FirebaseAuthContext", () => ({
  useFirebaseAuth: () => ({ user: fixture.user, userProfile: null, isLoading: false }),
}));
vi.mock("@/lib/basePath", () => ({
  createUrl: fixture.createUrl,
}));
vi.mock("@/config/navigation", () => ({
  getDiscoverGroups: () => [],
  getHeaderItems: () => [],
  getMobileItems: () => [],
}));
vi.mock("./ui/dropdown-menu", () => ({
  DropdownMenu: "div",
  DropdownMenuContent: "div",
  DropdownMenuItem: "div",
  DropdownMenuTrigger: "button",
}));

function collectLinks(node: React.ReactNode): React.ReactElement<Record<string, any>>[] {
  if (Array.isArray(node)) return node.flatMap(collectLinks);
  if (!React.isValidElement<Record<string, any>>(node)) return [];
  return [
    ...(node.type === "a" ? [node] : []),
    ...collectLinks(node.props.children),
  ];
}

function accountAdminLinks() {
  return collectLinks(Navigation({})).filter(link =>
    String(link.props["data-testid"] || "").includes("account-admin-dashboard"),
  );
}

describe("Navigation account admin dashboard link", () => {
  beforeEach(() => {
    fixture.isAdmin = false;
    fixture.user = { email: "admin@example.com", displayName: "Admin" };
    fixture.stateIndex = 0;
    fixture.setMenuOpen.mockClear();
    fixture.createUrl.mockClear();
  });

  it("shows the base-path-aware dashboard link in the desktop account dropdown for admins", () => {
    fixture.isAdmin = true;

    const links = accountAdminLinks();

    expect(links).toHaveLength(2);
    expect(links.map(link => link.props["data-testid"])).toEqual([
      "desktop-account-admin-dashboard",
      "mobile-account-admin-dashboard",
    ]);
    expect(links.map(link => link.props.to)).toEqual([
      "/studio/admin/dashboard",
      "/studio/admin/dashboard",
    ]);
    expect(links.map(link => link.props.children[1])).toEqual([" Dashboard admin", " Dashboard admin"]);
    expect(fixture.createUrl).toHaveBeenCalledWith("/admin/dashboard");
  });

  it("closes the mobile account panel after selecting the dashboard link", () => {
    fixture.isAdmin = true;
    const mobileLink = accountAdminLinks().find(
      link => link.props["data-testid"] === "mobile-account-admin-dashboard",
    );

    mobileLink?.props.onClick();

    expect(mobileLink).toBeDefined();
    expect(fixture.setMenuOpen).toHaveBeenCalledExactlyOnceWith(false);
  });

  it("keeps both account menus free of the dashboard link for non-admins", () => {
    expect(accountAdminLinks()).toHaveLength(0);
    expect(collectLinks(Navigation({})).some(link => link.props.to === "/studio/stampa-foto-aversa/i-miei-ordini")).toBe(true);
  });
});
