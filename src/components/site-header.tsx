"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserProfile } from "@/components/auth/user-profile";
import { ModeToggle } from "./ui/mode-toggle";
import { Building2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="border-b">
      <div className="container mx-auto px-4 py-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-8">
            <h1 className="text-xl font-bold">
              <Link
                href="/"
                className="flex items-center gap-2 text-foreground hover:text-foreground/80 transition-colors"
              >
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10">
                  <Building2 className="h-5 w-5 text-primary" />
                </div>
                <span>Zonaprop Monitor</span>
              </Link>
            </h1>

            <nav className="hidden md:flex items-center gap-6">
              <Link
                href="/"
                className={cn(
                  "text-sm font-medium transition-colors hover:text-primary",
                  pathname === "/" ? "text-foreground" : "text-muted-foreground"
                )}
              >
                Inicio
              </Link>
              <Link
                href="/extract"
                className={cn(
                  "text-sm font-medium transition-colors hover:text-primary",
                  pathname === "/extract" ? "text-foreground" : "text-muted-foreground"
                )}
              >
                Extraer Datos
              </Link>
              <Link
                href="/extract-search"
                className={cn(
                  "text-sm font-medium transition-colors hover:text-primary",
                  pathname === "/extract-search" ? "text-foreground" : "text-muted-foreground"
                )}
              >
                Extraer Búsqueda
              </Link>
              <Link
                href="/saved-searches"
                className={cn(
                  "text-sm font-medium transition-colors hover:text-primary",
                  pathname === "/saved-searches" ? "text-foreground" : "text-muted-foreground"
                )}
              >
                Guardadas
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-4">
            <UserProfile />
            <ModeToggle />
          </div>
        </div>
      </div>
    </header>
  );
}
