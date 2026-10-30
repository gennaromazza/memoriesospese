import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import {
  ChevronDown,
  ExternalLink,
  Home,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { ADMIN_NAV_GROUPS } from "@/components/admin/adminNavigation";
import {
  ADMIN_NAVIGATION_REQUEST_EVENT,
  ADMIN_NAVIGATION_SELECTION_EVENT,
  findAdminNavigationSelection,
  type AdminNavigationSelection,
  type AdminNavigationState,
  type NavGroup,
  type NavTarget,
} from "@/components/admin/adminNavigation";
import { useFirebaseAuth } from "@/context/FirebaseAuthContext";
import { useStudio } from "@/context/StudioContext";
import { useLogout } from "@/hooks/useLogout";
import { createUrl, removeBasePath } from "@/lib/basePath";

const dashboardDefaults: AdminNavigationState = {
  tab: "calendario",
  jobSection: "jobs-list",
  bookingSection: "bookings-list",
  consultationSection: "consulenze",
  settingsSection: "studio",
  sitoSection: "portfolio",
};

function getStoredDashboardSelection(): AdminNavigationSelection {
  if (typeof window === "undefined") {
    return findAdminNavigationSelection(dashboardDefaults);
  }

  const state: AdminNavigationState = {
    tab: sessionStorage.getItem("activeTab") || dashboardDefaults.tab,
    jobSection:
      sessionStorage.getItem("activeJobSection") ||
      dashboardDefaults.jobSection,
    bookingSection:
      sessionStorage.getItem("activeBookingSection") ||
      dashboardDefaults.bookingSection,
    consultationSection:
      sessionStorage.getItem("activeConsultationSection") ||
      dashboardDefaults.consultationSection,
    settingsSection:
      sessionStorage.getItem("settingsSection") ||
      dashboardDefaults.settingsSection,
    sitoSection:
      sessionStorage.getItem("activeSitoSection") ||
      dashboardDefaults.sitoSection,
  };

  return findAdminNavigationSelection(state);
}

function getSelectionForPath(path: string): AdminNavigationSelection {
  const normalizedPath = removeBasePath(path.split("?")[0] || "/");
  if (normalizedPath === "/admin/dashboard") {
    return getStoredDashboardSelection();
  }

  const routeItems: Array<{ pattern: RegExp; itemId: string }> = [
    { pattern: /^\/admin\/jobs(?:\/[^/]+)?$/, itemId: "jobs-list" },
    { pattern: /^\/admin\/photobooks\/[^/]+$/, itemId: "photobooks" },
    { pattern: /^\/admin\/galleries\/[^/]+\/questionnaire$/, itemId: "questionnaire" },
    { pattern: /^\/admin\/(?:galleries\/[^/]+|gallery\/[^/]+\/manage|delete-gallery)$/, itemId: "galleries" },
    { pattern: /^\/admin\/consulenze\/templates$/, itemId: "consulenze-templates" },
    { pattern: /^\/admin\/consulenze$/, itemId: "consulenze" },
    { pattern: /^\/admin\/bulk-email$/, itemId: "bulkEmail" },
    { pattern: /^\/admin\/(?:sicurezza|authorize-device)$/, itemId: "sicurezza" },
    { pattern: /^\/admin\/product-stats$/, itemId: "product-stats" },
    { pattern: /^\/admin\/backup$/, itemId: "backup" },
    { pattern: /^\/admin\/audit$/, itemId: "audit" },
    { pattern: /^\/admin\/phone-migration$/, itemId: "phone-migration" },
    { pattern: /^\/admin\/payment-audit$/, itemId: "audit" },
    { pattern: /^\/admin\/(?:gift-card(?:\/stampa\/[^/]+)?|gift-card)$/, itemId: "gift-card" },
    { pattern: /^\/admin\/(?:moduli-template)$/, itemId: "moduli-informativi" },
  ];

  const matchingItemId = routeItems.find(({ pattern }) =>
    pattern.test(normalizedPath),
  )?.itemId;

  if (matchingItemId) {
    for (const group of ADMIN_NAV_GROUPS) {
      if (group.items?.some((item) => item.id === matchingItemId)) {
        return { groupId: group.id, itemId: matchingItemId };
      }
    }
  }

  return { groupId: "", itemId: "" };
}

function getItemLabel(selection: AdminNavigationSelection): string {
  const group = ADMIN_NAV_GROUPS.find(
    (item) => item.id === selection.groupId,
  );
  return (
    group?.items?.find((item) => item.id === selection.itemId)?.label ??
    group?.label ??
    "Pannello amministratore"
  );
}

function persistTarget(target: NavTarget) {
  if (!target.tab) return;
  sessionStorage.setItem("activeTab", target.tab);
  if (target.bookingSection) {
    sessionStorage.setItem("activeBookingSection", target.bookingSection);
  }
  if (target.consultationSection) {
    sessionStorage.setItem(
      "activeConsultationSection",
      target.consultationSection,
    );
  }
  if (target.jobSection) {
    sessionStorage.setItem("activeJobSection", target.jobSection);
  }
  if (target.settingsSection) {
    sessionStorage.setItem("settingsSection", target.settingsSection);
  }
  if (target.sitoSection) {
    sessionStorage.setItem("activeSitoSection", target.sitoSection);
  }
}

interface AdminSidebarLayoutProps {
  children: ReactNode;
}

export default function AdminSidebarLayout({
  children,
}: AdminSidebarLayoutProps) {
  const [location, navigate] = useLocation();
  const { studioSettings } = useStudio();
  const { user, userProfile } = useFirebaseAuth();
  const { handleLogout } = useLogout();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [selection, setSelection] = useState(() =>
    getStoredDashboardSelection(),
  );
  const [expandedGroupId, setExpandedGroupId] = useState(
    selection.groupId,
  );

  useEffect(() => {
    const next = getSelectionForPath(location);
    setSelection(next);
    setExpandedGroupId(next.groupId);
  }, [location]);

  useEffect(() => {
    const handleSelection = (event: Event) => {
      const next = (event as CustomEvent<AdminNavigationSelection>).detail;
      if (!next) return;
      setSelection(next);
      setExpandedGroupId(next.groupId);
    };
    window.addEventListener(ADMIN_NAVIGATION_SELECTION_EVENT, handleSelection);
    return () =>
      window.removeEventListener(
        ADMIN_NAVIGATION_SELECTION_EVENT,
        handleSelection,
      );
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [mobileOpen]);

  const currentPath = useMemo(
    () => removeBasePath(location.split("?")[0] || "/"),
    [location],
  );
  const pageLabel = getItemLabel(selection);
  const accountName =
    userProfile?.displayName ||
    user?.displayName ||
    user?.email?.split("@")[0] ||
    "Amministratore";
  const studioName = studioSettings.name || "Image Studio";

  const navigateToTarget = (target: NavTarget) => {
    if (target.href) {
      const href = createUrl(target.href);
      if (target.newTab) {
        window.open(href, "_blank", "noopener,noreferrer");
      } else {
        navigate(href);
        setMobileOpen(false);
      }
      return;
    }

    persistTarget(target);
    if (currentPath === createUrl("/admin/dashboard") || currentPath === "/admin/dashboard") {
      window.dispatchEvent(
        new CustomEvent(ADMIN_NAVIGATION_REQUEST_EVENT, { detail: target }),
      );
    } else {
      navigate(createUrl("/admin/dashboard"));
    }
    setMobileOpen(false);
  };

  const navigateToGroup = (group: NavGroup) => {
    if (!group.items?.length) {
      if (group.target) {
        setSelection({ groupId: group.id, itemId: group.id });
        navigateToTarget(group.target);
      }
      return;
    }

    setExpandedGroupId((current) =>
      current === group.id ? "" : group.id,
    );
  };

  const renderSidebar = (mobile = false) => (
    <div className="flex h-full min-h-0 flex-col bg-[#f4f7f3] text-blue-gray">
      <div className="flex items-center gap-3 border-b border-blue-gray/10 px-5 py-5">
        {studioSettings.logo ? (
          <img
            src={studioSettings.logo}
            alt=""
            className="h-10 w-10 rounded-xl object-contain"
          />
        ) : (
          <span
            aria-hidden="true"
            className="grid h-10 w-10 place-items-center rounded-xl bg-blue-gray text-sm font-bold text-white"
          >
            {studioName.slice(0, 1).toUpperCase()}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{studioName}</p>
          <p className="text-xs text-blue-gray/65">Pannello amministratore</p>
        </div>
        {mobile && (
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Chiudi menu"
            className="grid h-9 w-9 place-items-center rounded-lg hover:bg-blue-gray/10"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <nav
        aria-label="Navigazione amministrazione"
        className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-4"
      >
        {ADMIN_NAV_GROUPS.map((group) => {
          const GroupIcon = group.icon;
          const isExpanded = expandedGroupId === group.id;
          const isGroupActive = selection.groupId === group.id;

          return (
            <section key={group.id}>
              <button
                type="button"
                onClick={() => navigateToGroup(group)}
                aria-expanded={group.items?.length ? isExpanded : undefined}
                className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm transition-colors ${
                  isGroupActive
                    ? "bg-white font-semibold text-blue-gray shadow-sm"
                    : "text-blue-gray/80 hover:bg-white/70"
                }`}
                data-testid={`admin-sidebar-group-${group.id}`}
              >
                <GroupIcon className="h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{group.label}</span>
                {group.items?.length ? (
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 transition-transform ${
                      isExpanded ? "rotate-180" : ""
                    }`}
                  />
                ) : null}
              </button>

              {group.items?.length && isExpanded ? (
                <div className="ml-5 mt-1 space-y-0.5 border-l border-blue-gray/15 pl-3">
                  {group.items.map((item, index) => {
                    const ItemIcon = item.icon;
                    const isItemActive = selection.itemId === item.id;
                    return (
                      <div key={item.id}>
                        {item.sectionLabel && (
                          <p
                            className={`px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-blue-gray/50 ${
                              index === 0 ? "pt-1" : ""
                            }`}
                          >
                            {item.sectionLabel}
                          </p>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setSelection({
                              groupId: group.id,
                              itemId: item.id,
                            });
                            navigateToTarget(item.target);
                          }}
                          aria-current={isItemActive ? "page" : undefined}
                          className={`flex min-h-10 w-full items-center gap-2 rounded-lg px-2 text-left text-[13px] transition-colors ${
                            isItemActive
                              ? "bg-[#dcebe3] font-semibold text-blue-gray"
                              : "text-blue-gray/75 hover:bg-white/80 hover:text-blue-gray"
                          }`}
                          data-testid={`admin-sidebar-item-${item.id}`}
                        >
                          <ItemIcon className="h-3.5 w-3.5 shrink-0" />
                          <span className="min-w-0 flex-1 truncate">
                            {item.label}
                          </span>
                          {item.target.newTab && (
                            <ExternalLink className="h-3 w-3 shrink-0 opacity-55" />
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </section>
          );
        })}
      </nav>

      <div className="space-y-2 border-t border-blue-gray/10 p-3">
        <button
          type="button"
          onClick={() => {
            navigate(createUrl("/"));
            setMobileOpen(false);
          }}
          className="flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-sm text-blue-gray/80 hover:bg-white/80"
        >
          <Home className="h-4 w-4" />
          Vai al sito
        </button>
        <div className="flex items-center gap-3 rounded-xl bg-white/80 p-3">
          <span
            aria-hidden="true"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#dcebe3] text-sm font-semibold text-blue-gray"
          >
            {accountName.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold">{accountName}</p>
            <p className="text-[11px] text-blue-gray/60">Amministratore</p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            aria-label="Esci dal pannello"
            title="Esci"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-blue-gray/65 hover:bg-red-50 hover:text-red-600"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background lg:flex">
      {mobileOpen && (
        <button
          type="button"
          aria-label="Chiudi menu"
          className="fixed inset-0 z-40 bg-slate-950/40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[min(84vw,300px)] -translate-x-full border-r border-blue-gray/10 shadow-xl transition-transform duration-200 lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:w-64 lg:shrink-0 lg:translate-x-0 lg:shadow-none ${
          mobileOpen ? "translate-x-0" : ""
        }`}
      >
        {renderSidebar(mobileOpen)}
      </aside>

      <div className="min-h-screen min-w-0 flex-1">
        <div className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-blue-gray/10 bg-background/95 px-4 backdrop-blur lg:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Apri menu amministrazione"
            aria-expanded={mobileOpen}
            className="grid h-9 w-9 place-items-center rounded-lg hover:bg-muted"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="truncate text-sm font-semibold text-blue-gray">
            {pageLabel}
          </span>
        </div>
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}

