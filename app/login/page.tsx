"use client"

import { Navigation } from "@/components/navigation"
import type React from "react"
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Brain, Eye, EyeOff, AlertCircle, Wifi, WifiOff } from "lucide-react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { apiService, safeStorage } from "@/lib/api"
import { ThemeToggle } from "@/components/theme-toggle"

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [isOnline, setIsOnline] = useState(true)
  const router = useRouter()
  const searchParams = useSearchParams()

  // 🛡️ Check for session expiry and online status
  useEffect(() => {
    const expired = searchParams?.get('expired')
    if (expired === 'true') {
      setError('Your session has expired. Please login again.')
    }
    
    // Monitor online status
    setIsOnline(navigator.onLine)
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [searchParams])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // 🛡️ Validate input
    if (!email.trim() || !password.trim()) {
      setError("Please enter both email and password.")
      return
    }
    
    if (!isOnline) {
      setError("You are offline. Please check your internet connection.")
      return
    }
    
    setIsLoading(true)
    setError("")

    try {
      // Call the real backend API
      const response = await apiService.login(email, password)

      if (response.success) {
        // 🛡️ Store auth token using safe storage
        const tokenSaved = safeStorage.setItem("auth-token", response.data.token)
        
        // Store user session
        const userSaved = safeStorage.setJSON("learnx_user", {
          id: response.data.user.id,
          email: response.data.user.email,
          type: response.data.user.role,
          firstName: response.data.user.firstName,
          lastName: response.data.user.lastName,
          loggedIn: true,
        })

        if (!tokenSaved || !userSaved) {
          setError("Unable to save session. Please check if cookies/storage is enabled.")
          return
        }

        // Check for redirect destination
        let redirectTo = '/dashboard'
        try {
          const saved = sessionStorage.getItem('redirectAfterLogin')
          if (saved) {
            redirectTo = saved
            sessionStorage.removeItem('redirectAfterLogin')
          }
        } catch {}

        router.push(redirectTo)
      } else {
        setError(response.message || "Login failed. Please try again.")
      }
    } catch (err: any) {
      console.error("Login error:", err)
      // 🛡️ More helpful error messages
      if (!isOnline || err.message?.includes('fetch') || err.message?.includes('network')) {
        setError("Unable to connect to server. Please check your internet connection.")
      } else if (err.message?.includes('timeout')) {
        setError("Request timed out. Please try again.")
      } else if (err.message?.includes('401') || err.message?.includes('Invalid')) {
        setError("Invalid email or password. Please check your credentials.")
      } else {
        setError(err.message || "Login failed. Please try again.")
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header with Theme Toggle */}
      <div className="border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <Brain className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="text-xl font-black font-montserrat text-foreground">LEARNX</span>
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </div>

      {/* Login Form */}
      <div className="flex items-center justify-center p-4 py-12">
        <div className="w-full max-w-md">
          {/* 🛡️ Offline indicator */}
          {!isOnline && (
            <Alert className="mb-4 border-yellow-500/50 bg-yellow-500/10">
              <WifiOff className="h-4 w-4 text-yellow-600" />
              <AlertDescription className="font-open-sans text-yellow-600">
                You are offline. Please check your internet connection.
              </AlertDescription>
            </Alert>
          )}
          
          <Card className="border-border">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl font-black font-montserrat">Welcome Back</CardTitle>
              <CardDescription className="font-open-sans">Sign in to continue your learning journey</CardDescription>
            </CardHeader>
            <CardContent>
              {error && (
                <Alert className="mb-4 border-destructive/50 text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="font-open-sans">{error}</AlertDescription>
                </Alert>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="font-open-sans">
                    Email
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="font-open-sans"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password" className="font-open-sans">
                    Password
                  </Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="pr-10 font-open-sans"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className="flex items-center">
                  <div className="flex items-center space-x-2">
                    <input id="remember" type="checkbox" className="rounded border-border" />
                    <Label htmlFor="remember" className="text-sm font-open-sans">
                      Remember me
                    </Label>
                  </div>
                </div>

                <Button type="submit" className="w-full font-open-sans" disabled={isLoading}>
                  {isLoading ? "Signing in..." : "Sign In"}
                </Button>
              </form>

              <div className="mt-6">
                <Separator className="my-4" />
                <div className="text-center">
                  <p className="text-sm text-muted-foreground font-open-sans">
                    Don't have an account?{" "}
                    <Link href="/signup" className="text-accent hover:underline font-medium">
                      Sign up
                    </Link>
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="mt-8 text-center">
            <Link
              href="/"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors font-open-sans"
            >
              ← Back to home
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}