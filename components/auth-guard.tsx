"use client"

import type React from "react"

import { useEffect, useState, useCallback } from "react"
import { useRouter, usePathname, useSearchParams } from "next/navigation"

interface AuthGuardProps {
  children: React.ReactNode
  requireAuth?: boolean
}

// 🛡️ Safe localStorage access
const safeGetItem = (key: string): string | null => {
  try {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

// 🛡️ Validate user session data
const isValidUserSession = (userStr: string | null): boolean => {
  if (!userStr) return false;
  try {
    const user = JSON.parse(userStr);
    return !!(user && user.id && user.email);
  } catch {
    // Corrupted data
    try {
      localStorage.removeItem('learnx_user');
    } catch {}
    return false;
  }
};

export function AuthGuard({ children, requireAuth = true }: AuthGuardProps) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
  const [sessionError, setSessionError] = useState<string | null>(null)
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Check for session expiry message
  useEffect(() => {
    const expired = searchParams?.get('expired');
    if (expired === 'true') {
      setSessionError('Your session has expired. Please login again.');
    }
  }, [searchParams]);

  const checkAuth = useCallback(() => {
    const token = safeGetItem("auth-token")
    const user = safeGetItem("learnx_user")
    
    // Validate both token and user data
    const hasValidToken = !!token;
    const hasValidUser = isValidUserSession(user);
    
    // If token exists but user data is invalid, clear everything
    if (hasValidToken && !hasValidUser) {
      try {
        localStorage.removeItem('auth-token');
        localStorage.removeItem('learnx_user');
      } catch {}
      setIsAuthenticated(false);
      return;
    }
    
    setIsAuthenticated(hasValidToken && hasValidUser);
  }, []);

  useEffect(() => {
    checkAuth();
    
    // 🛡️ Listen for storage changes (logout from another tab)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'learnx_user' || e.key === 'auth-token') {
        checkAuth();
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [checkAuth])

  useEffect(() => {
    if (isAuthenticated === null) return // Still loading

    if (requireAuth && !isAuthenticated) {
      // Save the intended destination for redirect after login
      if (pathname && pathname !== '/login') {
        try {
          sessionStorage.setItem('redirectAfterLogin', pathname);
        } catch {}
      }
      router.push("/login")
    } else if (!requireAuth && isAuthenticated) {
      // Check if there's a saved redirect destination
      let redirectTo = '/dashboard';
      try {
        const saved = sessionStorage.getItem('redirectAfterLogin');
        if (saved) {
          redirectTo = saved;
          sessionStorage.removeItem('redirectAfterLogin');
        }
      } catch {}
      router.push(redirectTo)
    }
  }, [isAuthenticated, requireAuth, router, pathname])

  // Loading state
  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground text-sm">Loading...</p>
        </div>
      </div>
    )
  }

  // Session error state (for login page)
  if (sessionError && !requireAuth) {
    return (
      <>
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 bg-destructive text-destructive-foreground px-4 py-2 rounded-md shadow-lg">
          {sessionError}
        </div>
        {children}
      </>
    )
  }

  if (requireAuth && !isAuthenticated) {
    return null // Will redirect to login
  }

  if (!requireAuth && isAuthenticated) {
    return null // Will redirect to dashboard
  }

  return <>{children}</>
}
