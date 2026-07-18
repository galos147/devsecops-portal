import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import { AuthProvider } from "@/lib/auth/AuthContext";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
        <Sidebar />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <Topbar />
          <main style={{ flex: 1, overflowY: "auto", padding: 28 }}>
            {children}
          </main>
        </div>
      </div>
    </AuthProvider>
  );
}
