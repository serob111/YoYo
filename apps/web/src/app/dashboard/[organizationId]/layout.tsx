"use client";

import Link from "next/link";
import { usePathname, useParams, useRouter } from "next/navigation";
import {
  AddressBook,
  Buildings,
  CalendarBlank,
  ChatCircle,
  Gear,
  House,
  InstagramLogo,
  RocketLaunch,
  SignOut,
  SlidersHorizontal,
  TiktokLogo,
  UsersThree,
  type Icon
} from "@phosphor-icons/react";
import { getVerticalConfig } from "@yoyo/verticals";
import { useCurrentUser, useMyOrganizations, useOrganization } from "@/lib/hooks";
import { useConnectedAccounts } from "@/lib/integrations-hooks";
import { apiRequest } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { InitialsAvatar } from "@/components/initials-avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TopbarSearch } from "@/components/topbar-search";

const NAV_ICONS: Record<string, Icon> = {
  dashboard: House,
  inbox: ChatCircle,
  leads: UsersThree,
  contacts: AddressBook,
  properties: Buildings,
  viewings: CalendarBlank,
  members: UsersThree,
  automations: Gear,
  integrations: RocketLaunch,
  vertical: SlidersHorizontal
};

function roleLabel(role: string): string {
  return role.charAt(0) + role.slice(1).toLowerCase();
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ organizationId: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const { data: user, isError: userError } = useCurrentUser();
  const { data: organizations } = useMyOrganizations();
  const { data: organization } = useOrganization(params.organizationId);
  const { data: connectedAccounts } = useConnectedAccounts(params.organizationId);
  const verticalConfig = getVerticalConfig(organization?.vertical);

  if (userError) {
    router.push("/login");
    return null;
  }

  async function logout() {
    await apiRequest("/auth/logout", { method: "POST" });
    router.push("/login");
  }

  const basePath = `/dashboard/${params.organizationId}`;
  const instagram = connectedAccounts?.find((a) => a.provider === "INSTAGRAM");
  const tiktok = connectedAccounts?.find((a) => a.provider === "TIKTOK");

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const firstName = user?.name.split(" ")[0];
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <aside className="flex h-screen w-64 shrink-0 flex-col gap-6 overflow-y-auto border-r border-sidebar-border bg-sidebar px-4 py-6">
        <div className="flex items-center gap-2.5 px-2">
          <span className="h-6 w-6 shrink-0 rounded-[13px_4px_13px_4px] bg-primary" />
          <span className="text-2xl font-extrabold tracking-tighter">YoYo</span>
        </div>

        {organizations && organizations.length > 1 && (
          <Select
            items={Object.fromEntries(organizations.map((org) => [org.id, org.name]))}
            value={params.organizationId}
            onValueChange={(v) => v && router.push(`/dashboard/${v}`)}
          >
            <SelectTrigger className="w-full" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {organizations.map((org) => (
                <SelectItem key={org.id} value={org.id}>
                  {org.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <nav className="flex flex-col gap-1">
          {verticalConfig.navItems.map((item) => {
            const href = `${basePath}${item.path}`;
            const isActive = item.path === "" ? pathname === basePath : pathname.startsWith(href);
            const Icon = NAV_ICONS[item.key] ?? House;
            return (
              <Link
                key={item.key}
                href={href}
                className={cn(
                  "flex h-11 items-center gap-3 rounded-[10px] px-3 text-sm font-semibold text-foreground/80 transition-colors hover:bg-secondary hover:text-foreground",
                  isActive && "bg-secondary text-foreground"
                )}
              >
                <Icon size={20} weight={isActive ? "fill" : "regular"} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto flex flex-col gap-4">
          <div className="flex flex-col gap-2.5 rounded-xl border border-border bg-card px-3.5 py-3 text-sm">
            <span className="text-xs font-medium text-muted-foreground">Connections</span>
            <div className="flex items-center gap-2.5">
              <InstagramLogo size={18} weight="fill" color="#df3e93" />
              <span className="flex-1 truncate">Instagram</span>
              <span className={cn("h-2 w-2 rounded-full", instagram ? "bg-[#41a552]" : "bg-border")} />
            </div>
            <div className="flex items-center gap-2.5">
              <TiktokLogo size={18} weight="fill" />
              <span className="flex-1 truncate">TikTok</span>
              <span className={cn("h-2 w-2 rounded-full", tiktok ? "bg-[#41a552]" : "bg-border")} />
            </div>
          </div>

          <div className="flex items-center gap-2.5 px-1">
            {user && <InitialsAvatar name={user.name} size="sm" />}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{user?.name}</p>
              {organization && <p className="truncate text-xs text-muted-foreground">{roleLabel(organization.myRole)}</p>}
            </div>
            <button onClick={() => void logout()} aria-label="Log out" className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground">
              <SignOut size={18} />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[92px] shrink-0 items-center gap-6 border-b border-border px-7">
          <div className="min-w-0">
            <h1 className="truncate text-[28px] font-extrabold tracking-tight">
              {greeting}
              {firstName ? `, ${firstName}` : ""}!
            </h1>
            <p className="text-sm text-muted-foreground">{today}</p>
          </div>
          <TopbarSearch organizationId={params.organizationId} />
          {user && (
            <div className="flex shrink-0 items-center gap-2.5">
              <InitialsAvatar name={user.name} />
              <div className="hidden sm:block">
                <p className="text-sm font-semibold leading-tight">{user.name}</p>
                {organization && <p className="text-xs leading-tight text-muted-foreground">{roleLabel(organization.myRole)}</p>}
              </div>
            </div>
          )}
        </header>
        <main className="flex-1 overflow-y-auto p-7">{children}</main>
      </div>
    </div>
  );
}
