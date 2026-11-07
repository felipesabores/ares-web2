"use client";

import { useState, createContext, useContext } from "react";
import Sidebar from "@/components/Sidebar";

export const MobileMenuCtx = createContext<() => void>(() => {});
export const useMobileMenuToggle = () => useContext(MobileMenuCtx);

interface AppShellProps {
  children: React.ReactNode;
  initialRole: string;
  initialName: string;
}

export function AppShell({ children, initialRole, initialName }: AppShellProps) {
  const [open, setOpen] = useState(false);
  const isCliente = initialRole === "cliente";

  return (
    <MobileMenuCtx.Provider value={() => !isCliente && setOpen(true)}>
      <div className="flex h-screen overflow-hidden bg-ares">

        {!isCliente && (
          <>
            {open && (
              <div
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
                onClick={() => setOpen(false)}
              />
            )}
            <div
              className={`fixed inset-y-0 left-0 z-50 transform transition-transform duration-300 ease-in-out ${
                open ? "translate-x-0" : "-translate-x-full"
              }`}
            >
              <Sidebar
                onClose={() => setOpen(false)}
                userRole={initialRole}
                userName={initialName}
                roleLoaded={true}
              />
            </div>
          </>
        )}

        <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
          {children}
        </div>

      </div>
    </MobileMenuCtx.Provider>
  );
}
