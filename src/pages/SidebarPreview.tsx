import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { ClientsHubPage } from "@/components/ClientsHubPage";

export function SidebarPreview() {
  return (
    <SidebarProvider>
      <div className="flex h-screen w-full">
        <AppSidebar
          section="leadgen"
          currentSlug={null}
          role="admin"
          userName="Daniel Soják"
          amId="preview-am"
          subView="clients-hub"
        />
        <SidebarInset>
          <ClientsHubPage role="admin" />
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
