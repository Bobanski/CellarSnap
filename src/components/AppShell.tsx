"use client";

import { Suspense, useState } from "react";
import AppHeader from "@/components/AppHeader";
import BottomTabBar from "@/components/BottomTabBar";
import MenuOverlay from "@/components/MenuOverlay";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="flex h-dvh flex-col">
      <AppHeader onMenuOpen={() => setMenuOpen(true)} />
      <main className="flex-1 overflow-y-auto">{children}</main>
      <div className="relative z-10" style={{ overflow: "visible" }}>
        <Suspense fallback={null}>
          <BottomTabBar />
        </Suspense>
      </div>
      <MenuOverlay open={menuOpen} onClose={() => setMenuOpen(false)} />
    </div>
  );
}
