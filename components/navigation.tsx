"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Brain, Home, BookOpen, BarChart3, Settings, LogOut, User, GraduationCap } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ThemeToggle } from "@/components/theme-toggle"
import { apiService } from "@/lib/api"

export function Navigation() {
  const router = useRouter()
  const [user, setUser] = useState<{
    name: string;
    email: string;
    role: string;
    firstName?: string;
    lastName?: string;
  } | null>(null)

  useEffect(() => {
    // Load user from localStorage
    const storedUser = localStorage.getItem("learnx_user")
    if (storedUser) {
      try {
        const userData = JSON.parse(storedUser)
        setUser({
          name: `${userData.firstName || ''} ${userData.lastName || ''}`.trim() || userData.email?.split('@')[0] || 'User',
          email: userData.email || '',
          role: userData.type || 'student',
          firstName: userData.firstName,
          lastName: userData.lastName
        })
      } catch (e) {
        console.error('Failed to parse user data:', e)
      }
    }
  }, [])

  const handleLogout = () => {
    // Clear all auth data
    localStorage.removeItem("auth-token")
    localStorage.removeItem("learnx_user")
    // Clear search data
    localStorage.removeItem("learnx:searchResults")
    localStorage.removeItem("learnx:lastQuery")
    localStorage.removeItem("learnx:searchHistory")
    apiService.logout()
    router.push("/login")
  }

  const getInitials = (firstName?: string, lastName?: string, email?: string) => {
    if (firstName && lastName) {
      return `${firstName[0]}${lastName[0]}`.toUpperCase()
    }
    if (firstName) {
      return firstName[0].toUpperCase()
    }
    if (email) {
      return email[0].toUpperCase()
    }
    return "U"
  }

  return (
    <nav className="border-b border-border/50 glass sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-8">
            <Link
              href={user?.role === "teacher" ? "/teacher" : "/dashboard"}
              className="flex items-center space-x-2"
            >
              <div className="w-9 h-9 bg-gradient-to-br from-primary to-chart-5 rounded-xl flex items-center justify-center shadow-md">
                <Brain className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-black font-montserrat gradient-text">LEARNX</span>
            </Link>

            <div className="hidden md:flex items-center space-x-1">
              {user?.role === "teacher" ? (
                <>
                  <Link
                    href="/teacher"
                    className="flex items-center space-x-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors font-open-sans px-3 py-2 rounded-lg text-sm"
                  >
                    <Home className="w-4 h-4" />
                    <span>Dashboard</span>
                  </Link>
                  <Link
                    href="/teacher/upload"
                    className="flex items-center space-x-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors font-open-sans px-3 py-2 rounded-lg text-sm"
                  >
                    <BookOpen className="w-4 h-4" />
                    <span>Upload</span>
                  </Link>
                </>
              ) : (
                <>
                  <Link
                    href="/dashboard"
                    className="flex items-center space-x-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors font-open-sans px-3 py-2 rounded-lg text-sm"
                  >
                    <Home className="w-4 h-4" />
                    <span>Dashboard</span>
                  </Link>
                  <Link
                    href="/learn"
                    className="flex items-center space-x-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors font-open-sans px-3 py-2 rounded-lg text-sm"
                  >
                    <BookOpen className="w-4 h-4" />
                    <span>Learn</span>
                  </Link>
                  <Link
                    href="/progress"
                    className="flex items-center space-x-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors font-open-sans px-3 py-2 rounded-lg text-sm"
                  >
                    <BarChart3 className="w-4 h-4" />
                    <span>Progress</span>
                  </Link>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <ThemeToggle />

            {/* Role Badge */}
            {user && (
              <div className="hidden sm:flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-primary text-xs font-semibold font-open-sans">
                <GraduationCap className="w-3.5 h-3.5" />
                <span>{user.role === "teacher" ? "Teacher" : "Student"}</span>
              </div>
            )}

            {/* Logout Button */}
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleLogout}
              className="border-border/50 hover:bg-muted/50"
            >
              <LogOut className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">Logout</span>
            </Button>

            {/* Profile Avatar Dropdown */}
            {user && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="relative h-9 w-9 rounded-full">
                    <Avatar className="h-9 w-9 border-2 border-primary/20">
                      <AvatarFallback className="bg-gradient-to-br from-primary to-chart-5 text-white text-sm font-semibold">
                        {getInitials(user.firstName, user.lastName, user.email)}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56 border-border/50 bg-card/95 backdrop-blur-xl" align="end" forceMount>
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none font-montserrat">{user.name}</p>
                      <p className="text-xs leading-none text-muted-foreground font-open-sans">{user.email}</p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/profile" className="font-open-sans">
                      <User className="mr-2 h-4 w-4" />
                      <span>Profile</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/settings" className="font-open-sans">
                      <Settings className="mr-2 h-4 w-4" />
                      <span>Settings</span>
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </div>
    </nav>
  )
}
