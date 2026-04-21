import { useLocation, Link } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarRail,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  LayoutDashboard,
  Upload,
  Handshake,
  FileText,
  HelpCircle,
  Settings,
  LogOut,
  ChevronsUpDown,
  Eye,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useImpersonation } from "@/contexts/ImpersonationContext";
import { useArtistAuth } from "@/contexts/ArtistAuthContext";

export function ArtistSidebar() {
  const [location, navigate] = useLocation();
  const { isImpersonating, artistId, artistProfile, exitImpersonation } = useImpersonation();
  const { user, signOut } = useArtistAuth();

  const baseUrl = isImpersonating ? `/admin/view-artist/${artistId}` : "/artist";

  const navItems = [
    { title: "Dashboard",      url: baseUrl,                   icon: LayoutDashboard },
    { title: "Artwork Upload", url: `${baseUrl}/upload`,       icon: Upload },
    { title: "Commissions",    url: `${baseUrl}/commissions`,  icon: Handshake },
    { title: "Invoices",       url: `${baseUrl}/invoices`,     icon: FileText },
    { title: "FAQs",           url: `${baseUrl}/faqs`,         icon: HelpCircle },
    { title: "Settings",       url: `${baseUrl}/settings`,     icon: Settings },
  ];

  const isActive = (url: string) =>
    url === baseUrl ? location === baseUrl : location.startsWith(url);

  const displayName = isImpersonating
    ? artistProfile?.displayName || artistProfile?.vendorName || "Artist"
    : user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Artist";

  const displayEmail = isImpersonating
    ? artistProfile?.primaryEmail || ""
    : user?.email || "";

  const avatarInitial = displayName[0]?.toUpperCase() || "A";

  const handleSignOut = async () => {
    await signOut();
    navigate("/artist/login");
  };

  return (
    <Sidebar collapsible="icon">
      {/* ── Logo ── */}
      <SidebarHeader className="px-4 pt-5 pb-4 group-data-[collapsible=icon]:px-2 group-data-[collapsible=icon]:pt-3 group-data-[collapsible=icon]:pb-3">
        <Link href={baseUrl}>
          <div
            className="flex flex-col items-start gap-1 cursor-pointer group-data-[collapsible=icon]:hidden"
            data-testid="link-artist-home"
          >
            <img
              src="/logo.png"
              alt="East Side Studio London"
              className="h-5 w-auto block object-left object-contain"
            />
            <span className="text-[11px] text-neutral-400 tracking-wide">
              Artist Portal
            </span>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarSeparator />

      {/* ── Navigation ── */}
      <SidebarContent className="py-3">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.url)}
                    tooltip={item.title}
                    data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, "-")}`}
                    className="rounded-lg"
                  >
                    <Link href={item.url}>
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* ── User footer ── */}
      <SidebarFooter className="pb-3">
        <SidebarSeparator className="mb-2" />

        {isImpersonating ? (
          /* Impersonation banner in footer */
          <div className="flex items-center gap-2 px-2 py-2 rounded-lg bg-amber-50 border border-amber-200 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:border-0">
            <div className="flex items-center justify-center h-8 w-8 rounded-full bg-amber-100 shrink-0">
              <Eye className="h-4 w-4 text-amber-600" />
            </div>
            <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
              <p className="text-xs font-medium text-amber-800 truncate">View mode</p>
              <p className="text-[11px] text-amber-600 truncate">{displayName}</p>
            </div>
            <button
              onClick={exitImpersonation}
              className="text-[11px] font-medium text-amber-700 hover:text-amber-900 shrink-0 group-data-[collapsible=icon]:hidden"
              data-testid="button-exit-view"
            >
              Exit
            </button>
          </div>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2.5 w-full px-2 py-2 rounded-lg hover:bg-neutral-100 transition-colors text-left group group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
                <Avatar className="h-8 w-8 border border-neutral-200 shrink-0">
                  <AvatarFallback className="bg-neutral-900 text-white text-sm font-medium">
                    {avatarInitial}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                  <p className="text-sm font-medium text-neutral-900 truncate leading-tight">{displayName}</p>
                  {displayEmail && (
                    <p className="text-[11px] text-neutral-400 truncate">{displayEmail}</p>
                  )}
                </div>
                <ChevronsUpDown className="h-3.5 w-3.5 text-neutral-400 shrink-0 group-data-[collapsible=icon]:hidden" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              side="top"
              align="start"
              className="w-56 mb-1"
            >
              <div className="px-2 py-1.5">
                <p className="text-sm font-medium text-neutral-900 truncate">{displayName}</p>
                {displayEmail && (
                  <p className="text-xs text-neutral-400 truncate">{displayEmail}</p>
                )}
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/artist/settings" className="cursor-pointer">
                  <Settings className="h-4 w-4 mr-2" />
                  Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleSignOut}
                className="text-red-600 focus:text-red-600 focus:bg-red-50 cursor-pointer"
                data-testid="button-logout"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
