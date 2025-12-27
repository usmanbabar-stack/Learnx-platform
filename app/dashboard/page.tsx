"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Clock, Trophy, Zap, BookOpen, Play, RefreshCw, WifiOff } from "lucide-react"
import { AuthGuard } from "@/components/auth-guard"
import { Navigation } from "@/components/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { apiService, safeStorage } from "@/lib/api"

interface DashboardStats {
  totalHours: number
  videosWatched: number
  currentStreak: number
  experiencePoints: number
}

interface ContinueWatchingVideo {
  videoId: string
  title: string
  thumbnail: string
  channel: string
  progressTime: number
  totalDuration: number
  lastWatched: string
}

export default function DashboardPage() {
  const [userData, setUserData] = useState<any>(null)
  const [stats, setStats] = useState<DashboardStats>({
    totalHours: 0,
    videosWatched: 0,
    currentStreak: 0,
    experiencePoints: 0
  })
  const [continueWatching, setContinueWatching] = useState<ContinueWatchingVideo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isOnline, setIsOnline] = useState(true)

  useEffect(() => {
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
  }, [])

  useEffect(() => {
    // 🛡️ Load user data safely
    const user = safeStorage.getJSON<any>('learnx_user', null)
    if (user) {
      setUserData(user)
      
      // Fetch dashboard data if we have userId
      if (user.id) {
        fetchDashboardData(user.id)
      } else {
        setLoading(false)
      }
    } else {
      setLoading(false)
    }
  }, [])

  const fetchDashboardData = async (userId: number) => {
    setLoading(true)
    setError(null)
    
    try {
      // Fetch stats and continue watching in parallel
      const [statsResponse, watchingResponse] = await Promise.allSettled([
        apiService.getDashboardStats(userId),
        apiService.getContinueWatching(userId, 5)
      ])
      
      // Handle stats response
      if (statsResponse.status === 'fulfilled' && statsResponse.value.success) {
        setStats(statsResponse.value.data)
      }
      
      // Handle continue watching response
      if (watchingResponse.status === 'fulfilled' && watchingResponse.value.success) {
        setContinueWatching(watchingResponse.value.data.videos || [])
      }
      
      // Check if both failed
      if (statsResponse.status === 'rejected' && watchingResponse.status === 'rejected') {
        setError('Unable to load dashboard data. Please try again.')
      }
    } catch (err: any) {
      console.error('Dashboard fetch error:', err)
      if (!isOnline) {
        setError('You are offline. Some features may be unavailable.')
      } else {
        setError('Unable to load dashboard data. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleRetry = () => {
    if (userData?.id) {
      fetchDashboardData(userData.id)
    }
  }

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const getProgressPercent = (progress: number, total: number): number => {
    if (total === 0) return 0
    return Math.min(Math.round((progress / total) * 100), 100)
  }

  const getInitials = (firstName?: string, lastName?: string) => {
    if (!firstName && !lastName) return "U"
    return `${firstName?.[0] || ""}${lastName?.[0] || ""}`.toUpperCase()
  }

  return (
    <AuthGuard>
      <div className="min-h-screen bg-background">
        <Navigation />

        <main className="container mx-auto px-4 py-8 max-w-7xl">
          {/* 🛡️ Offline/Error Banner */}
          {!isOnline && (
            <Alert className="mb-6 border-yellow-500/50 bg-yellow-500/10">
              <WifiOff className="h-4 w-4 text-yellow-600" />
              <AlertDescription className="font-open-sans text-yellow-600">
                You are offline. Some features may be unavailable.
              </AlertDescription>
            </Alert>
          )}
          
          {error && (
            <Alert className="mb-6 border-destructive/50 bg-destructive/10">
              <AlertDescription className="font-open-sans text-destructive flex items-center justify-between">
                <span>{error}</span>
                <Button variant="outline" size="sm" onClick={handleRetry} disabled={loading}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                  Retry
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {/* Welcome Header */}
          <div className="mb-8 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16">
                <AvatarFallback className="bg-primary text-primary-foreground text-xl">
                  {getInitials(userData?.firstName, userData?.lastName)}
                </AvatarFallback>
              </Avatar>
              <div>
                <h1 className="text-3xl font-black font-montserrat">
                  Welcome back, {userData?.firstName || "Student"}!
                </h1>
                <p className="text-muted-foreground font-open-sans">
                  Ready to continue your learning journey?
                </p>
              </div>
            </div>
          </div>

          {/* Stats Overview */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Hours</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {loading ? '...' : `${stats.totalHours}h`}
                </div>
                <p className="text-xs text-muted-foreground">
                  {stats.totalHours > 0 ? 'Keep learning!' : 'Start learning to track hours'}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Videos Completed</CardTitle>
                <Trophy className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {loading ? '...' : stats.videosWatched}
                </div>
                <p className="text-xs text-muted-foreground">
                  {stats.videosWatched > 0 ? 'Great progress!' : 'Complete videos to earn points'}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Current Streak</CardTitle>
                <Zap className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {loading ? '...' : `${stats.currentStreak} days`}
                </div>
                <p className="text-xs text-muted-foreground">
                  {stats.currentStreak > 0 ? 'Keep it up!' : 'Learn daily to build streaks'}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Experience Points</CardTitle>
                <BookOpen className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {loading ? '...' : `${stats.experiencePoints} XP`}
                </div>
                <p className="text-xs text-muted-foreground">
                  Level {Math.floor(stats.experiencePoints / 1000) + 1}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Continue Watching Section */}
          {continueWatching.length > 0 && (
            <Card className="mb-8">
              <CardHeader>
                <CardTitle className="font-montserrat flex items-center gap-2">
                  <Play className="h-5 w-5" />
                  Continue Watching
                </CardTitle>
                <CardDescription className="font-open-sans">
                  Pick up where you left off
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {continueWatching.map((video) => (
                    <Link key={video.videoId} href={`/learn/${video.videoId}`}>
                      <Card className="hover:shadow-md transition-shadow cursor-pointer overflow-hidden">
                        <div className="relative">
                          <img 
                            src={video.thumbnail || `https://img.youtube.com/vi/${video.videoId}/mqdefault.jpg`}
                            alt={video.title}
                            className="w-full aspect-video object-cover"
                          />
                          <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-1">
                            <div className="flex justify-between text-white text-xs">
                              <span>{formatDuration(video.progressTime)}</span>
                              <span>{formatDuration(video.totalDuration)}</span>
                            </div>
                            <Progress 
                              value={getProgressPercent(video.progressTime, video.totalDuration)} 
                              className="h-1 mt-1"
                            />
                          </div>
                        </div>
                        <CardContent className="p-3">
                          <h4 className="font-medium text-sm line-clamp-2 font-montserrat">
                            {video.title || 'Educational Video'}
                          </h4>
                          <p className="text-xs text-muted-foreground mt-1">
                            {video.channel || 'YouTube'}
                          </p>
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Get Started Section */}
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="font-montserrat">Start Learning</CardTitle>
                <CardDescription className="font-open-sans">
                  Search for videos on any topic you want to learn
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Link href="/learn">
                  <Button className="w-full font-open-sans">
                    Browse Learning Videos
                  </Button>
                </Link>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="font-montserrat">Your Progress</CardTitle>
                <CardDescription className="font-open-sans">
                  Track your learning journey and achievements
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Link href="/progress">
                  <Button variant="outline" className="w-full font-open-sans">
                    View Progress
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>

          {/* User Info Card */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="font-montserrat">Account Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 font-open-sans">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Name:</span>
                <span className="font-medium">
                  {userData?.firstName} {userData?.lastName}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Email:</span>
                <span className="font-medium">{userData?.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Role:</span>
                <span className="font-medium capitalize">{userData?.type || "student"}</span>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    </AuthGuard>
  )
}
