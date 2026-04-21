import { Link, useLocation } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
} from "@/components/ui/sidebar";
import {
  LayoutDashboard,
  Image as ImageIcon,
  LayoutTemplate,
  Download,
  Palette,
  Layers,
  Settings,
  MessageSquare,
  Award,
  Mail,
  Users,
  PoundSterling,
  FileSignature,
  FileSpreadsheet,
  UserCircle,
  ShoppingCart,
  View,
  Store,
  Ruler,
  BarChart3,
  AlertTriangle,
  Frame,
  Video,
  Share2,
  FileSearch,
} from "lucide-react";

const adminMenuItems = [
  {
    title: "Dashboard",
    url: "/admin",
    icon: LayoutDashboard,
  },
  {
    title: "Artworks",
    url: "/admin/artworks",
    icon: ImageIcon,
  },
  {
    title: "Mockups",
    url: "/admin/mockups",
    icon: Layers,
  },
  {
    title: "Templates",
    url: "/admin/templates",
    icon: LayoutTemplate,
  },
  {
    title: "Exports",
    url: "/admin/exports",
    icon: Download,
  },
  {
    title: "Feedback",
    url: "/admin/feedback",
    icon: MessageSquare,
  },
  {
    title: "COA Editor",
    url: "/admin/coa-editor",
    icon: Award,
  },
  {
    title: "Email Templates",
    url: "/admin/email-templates",
    icon: Mail,
  },
  {
    title: "Artists",
    url: "/admin/artists",
    icon: Users,
  },
  {
    title: "Payouts",
    url: "/admin/payouts",
    icon: PoundSterling,
  },
  {
    title: "Contracts",
    url: "/admin/contracts",
    icon: FileSignature,
  },
  {
    title: "Forms",
    url: "/admin/forms",
    icon: FileSpreadsheet,
  },
  {
    title: "Creators",
    url: "/admin/creators",
    icon: UserCircle,
  },
  {
    title: "Quick Order",
    url: "/admin/quick-order",
    icon: ShoppingCart,
  },
  {
    title: "AR Viewer",
    url: "/admin/ar-viewer",
    icon: View,
  },
  {
    title: "Size Mapping",
    url: "/admin/size-mapping",
    icon: Ruler,
  },
  {
    title: "Shopify AR",
    url: "/admin/shopify-integration",
    icon: Store,
  },
  {
    title: "AR Analytics",
    url: "/admin/ar-analytics",
    icon: BarChart3,
  },
  {
    title: "AR Image Report",
    url: "/admin/ar-image-report",
    icon: ImageIcon,
  },
  {
    title: "Product Add-ons",
    url: "/admin/product-addons",
    icon: Layers,
  },
  {
    title: "Adaptive Product Images",
    url: "/admin/adaptive-images",
    icon: Frame,
  },
  {
    title: "Multi-Ratio",
    url: "/admin/multi-ratio",
    icon: Ruler,
  },
  {
    title: "High-Res Review",
    url: "/admin/high-res-review",
    icon: FileSearch,
  },
  {
    title: "Mount Review",
    url: "/admin/mount-review",
    icon: Layers,
  },
  {
    title: "Product Media",
    url: "/admin/product-media",
    icon: Video,
  },
  {
    title: "Social Media",
    url: "/admin/social-media",
    icon: Share2,
  },
  {
    title: "Error Logs",
    url: "/admin/error-logs",
    icon: AlertTriangle,
  },
  {
    title: "Settings",
    url: "/admin/settings",
    icon: Settings,
  },
];

export function AdminSidebar() {
  const [location] = useLocation();

  return (
    <Sidebar>
      <SidebarHeader className="p-4 border-b">
        <Link href="/admin">
          <div className="cursor-pointer hover-elevate px-3 py-3 rounded-lg">
            <div className="flex flex-col items-center gap-2">
              <img
                src={new URL("@assets/East Side Studio2_1line_Black_24_1763330142482.png", import.meta.url).href}
                alt="East Side Studio"
                className="h-6"
              />
              <p className="text-xs text-muted-foreground">Admin Dashboard</p>
            </div>
          </div>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Management</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {adminMenuItems.map((item) => {
                const Icon = item.icon;
                const isActive = location === item.url || 
                  (item.url !== "/admin" && location.startsWith(item.url));
                
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      data-testid={`sidebar-${item.title.toLowerCase()}`}
                    >
                      <Link href={item.url}>
                        <Icon className="w-4 h-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
