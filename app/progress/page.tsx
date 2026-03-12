"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Clock, Trophy, Zap, CheckCircle, TrendingUp, ArrowLeft, Brain, Target, Lightbulb, BookOpen } from "lucide-react"
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

interface VideoProgress {
  videoId: string
  title: string
  thumbnail: string
  channel: string
  progressTime: number
  totalDuration: number
  completed?: boolean
  lastWatched: string
  subject?: string
}

interface WeeklyData {
  day: string
  hours: number
  date: string
}

interface LearningPattern {
  hour: string
  avgMinutes: number
}

export default function ProgressPage() {
  const [userData, setUserData] = useState<any>(null)
  const [stats, setStats] = useState<DashboardStats>({
    totalHours: 0,
    videosWatched: 0,
    currentStreak: 0,
    experiencePoints: 0
  })
  const [recentlyWatched, setRecentlyWatched] = useState<VideoProgress[]>([])
  const [weeklyData, setWeeklyData] = useState<WeeklyData[]>([])
  const [learningPatterns, setLearningPatterns] = useState<LearningPattern[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState("overview")

  // Subject performance based on watched videos
  const [subjectPerformance, setSubjectPerformance] = useState<{subject: string, completed: number, total: number, color: string}[]>([])

  useEffect(() => {
    const user = safeStorage.getJSON<any>('learnx_user', null)
    if (user) {
      setUserData(user)
      if (user.id) {
        fetchProgressData(user.id)
      } else {
        setLoading(false)
      }
    } else {
      setLoading(false)
    }
  }, [])

  const fetchProgressData = async (userId: number) => {
    setLoading(true)
    try {
      const [statsRes, recentRes, weeklyRes, patternsRes] = await Promise.allSettled([
        apiService.getDashboardStats(userId),
        apiService.getRecentlyWatched(userId, 50),
        apiService.getWeeklyStats(userId),
        apiService.getLearningPatterns(userId)
      ])

      if (statsRes.status === 'fulfilled' && statsRes.value.success) {
        setStats(statsRes.value.data)
      }

      if (weeklyRes.status === 'fulfilled' && weeklyRes.value.success) {
        setWeeklyData(weeklyRes.value.data)
      }

      if (patternsRes.status === 'fulfilled' && patternsRes.value.success) {
        setLearningPatterns(patternsRes.value.data)
      }

      if (recentRes.status === 'fulfilled' && recentRes.value.success) {
        const videos = recentRes.value.data.videos || []
        setRecentlyWatched(videos)
        
        // Calculate subject performance from videos (REAL DATA)
        const subjects = new Map<string, { total: number, completed: number }>()
        videos.forEach((v: VideoProgress) => {
          const subject = v.subject || extractSubjectFromTitle(v.title)
          if (!subjects.has(subject)) {
            subjects.set(subject, { total: 0, completed: 0 })
          }
          const s = subjects.get(subject)!
          s.total++
          if (v.completed) s.completed++
        })
        
        const colors = ['#a855f7', '#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#06b6d4']
        const performance = Array.from(subjects.entries()).map(([subject, data], i) => ({
          subject,
          completed: data.completed,
          total: data.total,
          color: colors[i % colors.length]
        })).slice(0, 6)
        
        setSubjectPerformance(performance)
      }
    } catch (err) {
      console.error('Failed to fetch progress data:', err)
    } finally {
      setLoading(false)
    }
  }

  const extractSubjectFromTitle = (title: string): string => {
    const keywords: { [key: string]: string } = {
      'data structure': 'Data Structures',
      'algorithm': 'Algorithms',
      'machine learning': 'Machine Learning',
      'python': 'Python',
      'javascript': 'JavaScript',
      'react': 'React',
      'node': 'Node.js',
      'database': 'Database',
      'sql': 'SQL',
      'web': 'Web Development',
      'css': 'CSS',
      'html': 'HTML',
      'java': 'Java',
      'c++': 'C++',
      'ai': 'AI',
      'neural': 'Deep Learning'
    }
    const lowerTitle = title.toLowerCase()
    for (const [kw, name] of Object.entries(keywords)) {
      if (lowerTitle.includes(kw)) return name
    }
    return 'General'
  }

  const getLevel = (xp: number): number => Math.floor(xp / 500) + 1

  // Calculate week-over-week change
  const calculateWeekChange = (): number => {
    if (weeklyData.length < 7) return 0
    const thisWeekTotal = weeklyData.reduce((sum, d) => sum + d.hours, 0)
    // We don't have last week's data, so show actual hours
    return Math.round(thisWeekTotal * 10) / 10
  }

  // Find peak learning time from patterns
  const getPeakLearningTime = (): string => {
    if (learningPatterns.length === 0) return 'Not enough data'
    const peak = learningPatterns.reduce((max, p) => p.avgMinutes > max.avgMinutes ? p : max, learningPatterns[0])
    return peak.avgMinutes > 0 ? peak.hour : 'Not enough data'
  }

  // Chart component for weekly activity (REAL DATA)
  const WeeklyChart = () => {
    const maxHours = Math.max(...weeklyData.map(d => d.hours), 0.5)
    return (
      <div className="flex items-end justify-between h-48 gap-2 pt-4">
        {weeklyData.length > 0 ? weeklyData.map((day, i) => (
          <div key={day.day} className="flex flex-col items-center flex-1">
            <div className="w-full bg-muted rounded-t-sm relative" style={{ height: '160px' }}>
              <div 
                className="absolute bottom-0 w-full bg-primary rounded-t-sm transition-all duration-500"
                style={{ height: `${(day.hours / maxHours) * 100}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground mt-2">{day.day}</span>
            <span className="text-xs font-medium">{day.hours.toFixed(1)}h</span>
          </div>
        )) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            No data yet - start watching videos!
          </div>
        )}
      </div>
    )
  }

  // Performance chart based on completion rates (REAL DATA)
  const PerformanceChart = () => {
    if (subjectPerformance.length === 0) {
      return (
        <div className="h-48 flex items-center justify-center text-muted-foreground">
          No performance data yet - watch more videos!
        </div>
      )
    }
    
    const scores = subjectPerformance.map(s => s.total > 0 ? (s.completed / s.total) * 100 : 0)
    const maxVal = 100
    
    return (
      <div className="relative h-48 mt-4">
        <svg className="w-full h-full" viewBox="0 0 400 150" preserveAspectRatio="none">
          <defs>
            <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#22c55e" />
              <stop offset="100%" stopColor="#22c55e" />
            </linearGradient>
          </defs>
          <polyline
            fill="none"
            stroke="url(#lineGradient)"
            strokeWidth="3"
            points={scores.map((p, i) => `${(i / Math.max(scores.length - 1, 1)) * 400},${150 - (p / maxVal) * 130}`).join(' ')}
          />
          {scores.map((p, i) => (
            <circle
              key={i}
              cx={(i / Math.max(scores.length - 1, 1)) * 400}
              cy={150 - (p / maxVal) * 130}
              r="5"
              fill="#22c55e"
            />
          ))}
        </svg>
        <div className="flex justify-between text-xs text-muted-foreground mt-2">
          {subjectPerformance.map(s => (
            <span key={s.subject} className="truncate max-w-[80px]">{s.subject}</span>
          ))}
        </div>
      </div>
    )
  }

  // Focus pattern chart (REAL DATA from backend)
  const FocusPatternChart = () => {
    const maxScore = Math.max(...learningPatterns.map(p => p.avgMinutes), 1)
    
    if (learningPatterns.every(p => p.avgMinutes === 0)) {
      return (
        <div className="h-48 flex items-center justify-center text-muted-foreground">
          No learning pattern data yet - keep watching videos!
        </div>
      )
    }
    
    return (
      <div className="relative h-48 mt-4">
        <svg className="w-full h-full" viewBox="0 0 400 150" preserveAspectRatio="none">
          <polyline
            fill="none"
            stroke="#a855f7"
            strokeWidth="3"
            points={learningPatterns.map((p, i) => `${(i / (learningPatterns.length - 1)) * 400},${150 - (p.avgMinutes / maxScore) * 130}`).join(' ')}
          />
          {learningPatterns.map((p, i) => (
            <circle
              key={i}
              cx={(i / (learningPatterns.length - 1)) * 400}
              cy={150 - (p.avgMinutes / maxScore) * 130}
              r="5"
              fill="#a855f7"
            />
          ))}
        </svg>
        <div className="flex justify-between text-xs text-muted-foreground mt-2">
          {learningPatterns.map(p => <span key={p.hour}>{p.hour}</span>)}
        </div>
      </div>
    )
  }

  // Pie chart for study time distribution (REAL DATA)
  const PieChart = () => {
    if (subjectPerformance.length === 0) {
      return (
        <div className="h-40 flex items-center justify-center text-muted-foreground">
          No subject data yet
        </div>
      )
    }
    
    const total = subjectPerformance.reduce((a, b) => a + b.total, 0)
    let cumulativePercent = 0
    
    return (
      <div className="flex items-center justify-center gap-8">
        <div className="relative w-40 h-40">
          <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
            {subjectPerformance.map((item, i) => {
              const percent = (item.total / total) * 100
              const dashArray = `${percent} ${100 - percent}`
              const dashOffset = -cumulativePercent
              cumulativePercent += percent
              return (
                <circle
                  key={i}
                  cx="50"
                  cy="50"
                  r="40"
                  fill="none"
                  stroke={item.color}
                  strokeWidth="20"
                  strokeDasharray={dashArray}
                  strokeDashoffset={dashOffset}
                  className="transition-all duration-500"
                />
              )
            })}
          </svg>
        </div>
        <div className="space-y-2">
          {subjectPerformance.map((item, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
              <span>{item.subject}: {item.total} videos ({item.completed} completed)</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Calculate videos this week
  const getVideosThisWeek = (): number => {
    const oneWeekAgo = new Date()
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)
    return recentlyWatched.filter(v => new Date(v.lastWatched) >= oneWeekAgo).length
  }

  // Get total hours this week
  const getTotalHoursThisWeek = (): number => {
    return weeklyData.reduce((sum, d) => sum + d.hours, 0)
  }

  return (
    <AuthGuard>
      <div className="min-h-screen bg-background relative">
        <div className="absolute inset-0 mesh-gradient pointer-events-none" />
        <div className="relative z-10">
        <Navigation />

        <main className="container mx-auto px-4 py-8 max-w-7xl">
          {/* Header */}
          <div className="flex items-center gap-4 mb-8 animate-slide-up">
            <Button variant="ghost" size="sm" asChild className="hover:bg-muted/50">
              <Link href="/dashboard">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Dashboard
              </Link>
            </Button>
            <div>
              <h1 className="text-3xl font-black font-montserrat">Learning Analytics</h1>
              <p className="text-muted-foreground font-open-sans">Track your real learning progress</p>
            </div>
          </div>

          {/* Stats Overview */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-8 animate-slide-up stagger-1">
            <Card className="border-border/50 bg-card/80 backdrop-blur-sm hover-lift">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Study Time</CardTitle>
                <div className="stat-icon-purple"><Clock className="h-4 w-4" /></div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold font-montserrat">{loading ? '...' : `${stats.totalHours}h`}</div>
                <p className="text-xs text-muted-foreground">
                  {getTotalHoursThisWeek().toFixed(1)}h this week
                </p>
              </CardContent>
            </Card>

            <Card className="border-border/50 bg-card/80 backdrop-blur-sm hover-lift">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Experience Points</CardTitle>
                <div className="stat-icon-amber"><Zap className="h-4 w-4" /></div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold font-montserrat">{loading ? '...' : stats.experiencePoints.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">
                  Level {getLevel(stats.experiencePoints)}
                </p>
              </CardContent>
            </Card>

            <Card className="border-border/50 bg-card/80 backdrop-blur-sm hover-lift">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Learning Streak</CardTitle>
                <div className="stat-icon-rose"><Trophy className="h-4 w-4" /></div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold font-montserrat">{loading ? '...' : `${stats.currentStreak} days`}</div>
                <p className="text-xs text-muted-foreground">Keep it up! 🔥</p>
              </CardContent>
            </Card>
          </div>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="grid w-full grid-cols-4 bg-muted/30 backdrop-blur-sm border border-border/50">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="performance">Performance</TabsTrigger>
              <TabsTrigger value="patterns">Learning Patterns</TabsTrigger>
              <TabsTrigger value="insights">AI Insights</TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="space-y-6">
              <div className="grid gap-6 md:grid-cols-2">
                <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
                  <CardHeader>
                    <CardTitle>Weekly Learning Activity</CardTitle>
                    <CardDescription>Your actual study hours for the past 7 days</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <WeeklyChart />
                  </CardContent>
                </Card>

                <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
                  <CardHeader>
                    <CardTitle>Subject Progress</CardTitle>
                    <CardDescription>Completion rate by subject (videos completed / total watched)</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {subjectPerformance.length > 0 ? subjectPerformance.map((item, i) => {
                      const completionRate = item.total > 0 ? Math.round((item.completed / item.total) * 100) : 0
                      return (
                        <div key={i} className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span>{item.subject}</span>
                            <span className="font-medium">{item.completed}/{item.total} ({completionRate}%)</span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div 
                              className="h-full rounded-full transition-all duration-500"
                              style={{ width: `${completionRate}%`, backgroundColor: item.color }}
                            />
                          </div>
                        </div>
                      )
                    }) : (
                      <div className="text-center text-muted-foreground py-8">
                        No subject data yet - start watching videos!
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Performance Tab */}
            <TabsContent value="performance" className="space-y-6">
              <div className="grid gap-6 md:grid-cols-2">
                <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
                  <CardHeader>
                    <CardTitle>Completion Rate by Subject</CardTitle>
                    <CardDescription>How well you complete videos in each subject area</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <PerformanceChart />
                  </CardContent>
                </Card>

                <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
                  <CardHeader>
                    <CardTitle>Study Time Distribution</CardTitle>
                    <CardDescription>How your learning time is distributed across subjects</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <PieChart />
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Learning Patterns Tab */}
            <TabsContent value="patterns" className="space-y-6">
              <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle>Learning Time Distribution</CardTitle>
                  <CardDescription>When you study most during the day (based on your actual watch history)</CardDescription>
                </CardHeader>
                <CardContent>
                  <FocusPatternChart />
                  <div className="mt-6 p-4 bg-primary/5 border border-primary/10 rounded-xl">
                    <p className="text-sm">
                      <span className="font-semibold">Peak Learning Time:</span>{' '}
                      <span className="text-primary">{getPeakLearningTime()}</span>
                      {getPeakLearningTime() !== 'Not enough data' && (
                        <> - You tend to study most during this time. Consider scheduling important topics here.</>
                      )}
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle>Recent Learning Activity</CardTitle>
                  <CardDescription>Your last {Math.min(recentlyWatched.length, 10)} watched videos</CardDescription>
                </CardHeader>
                <CardContent>
                  {recentlyWatched.length > 0 ? (
                    <div className="space-y-3">
                      {recentlyWatched.slice(0, 10).map((video, i) => (
                        <div key={video.videoId} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                          <img 
                            src={video.thumbnail} 
                            alt={video.title} 
                            className="w-24 h-14 object-cover rounded-lg"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{video.title}</p>
                            <p className="text-sm text-muted-foreground">{video.channel}</p>
                          </div>
                          <div className="text-right">
                            {video.completed ? (
                              <span className="text-green-500 text-sm font-medium">✓ Completed</span>
                            ) : (
                              <span className="text-muted-foreground text-sm">
                                {Math.floor(video.progressTime / 60)}m watched
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center text-muted-foreground py-8">
                      No videos watched yet - start learning!
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* AI Insights Tab */}
            <TabsContent value="insights" className="space-y-6">
              <div className="grid gap-6 md:grid-cols-2">
                <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <div className="stat-icon-purple"><Brain className="w-4 h-4" /></div>
                      AI Recommendations
                    </CardTitle>
                    <CardDescription>Personalized suggestions based on your learning patterns</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="p-4 bg-green-500/5 border border-green-500/20 rounded-xl">
                      <h4 className="font-semibold text-green-600 dark:text-green-400">Study Schedule</h4>
                      <p className="text-sm text-muted-foreground mt-1">
                        {getPeakLearningTime() !== 'Not enough data' 
                          ? `Your peak performance is at ${getPeakLearningTime()}. Consider scheduling focused sessions during this time.`
                          : 'Keep watching videos to discover your optimal study time.'}
                      </p>
                    </div>
                    
                    <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-xl">
                      <h4 className="font-semibold text-blue-600 dark:text-blue-400">Strength Area</h4>
                      <p className="text-sm text-muted-foreground mt-1">
                        {subjectPerformance.length > 0 
                          ? `You've watched the most content in ${subjectPerformance[0].subject}. Consider diving deeper into advanced topics.`
                          : 'Start watching videos to identify your strength areas.'}
                      </p>
                    </div>
                    
                    <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl">
                      <h4 className="font-semibold text-amber-600 dark:text-amber-400">Improvement Area</h4>
                      <p className="text-sm text-muted-foreground mt-1">
                        {subjectPerformance.length > 1 
                          ? `Consider completing more videos in ${subjectPerformance[subjectPerformance.length - 1].subject} to balance your learning.`
                          : 'Watch more videos across different subjects to get personalized recommendations.'}
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
                  <CardHeader>
                    <CardTitle>Learning Goals</CardTitle>
                    <CardDescription>Track your progress towards learning milestones</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="p-4 border border-border/50 rounded-xl">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-medium">Complete 10 videos</span>
                        <span className="text-sm text-muted-foreground">{Math.min(stats.videosWatched, 10)}/10</span>
                      </div>
                      <Progress value={Math.min(stats.videosWatched / 10, 1) * 100} className="h-2" />
                    </div>
                    
                    <div className="p-4 border border-border/50 rounded-xl">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-medium">Study 10 hours total</span>
                        <span className="text-sm text-muted-foreground">{Math.min(stats.totalHours, 10)}/10h</span>
                      </div>
                      <Progress value={Math.min(stats.totalHours / 10, 1) * 100} className="h-2" />
                    </div>
                    
                    <div className="p-4 border border-border/50 rounded-xl">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-medium">7-day learning streak</span>
                        <span className="text-sm text-muted-foreground">{Math.min(stats.currentStreak, 7)}/7 days</span>
                      </div>
                      <Progress value={Math.min(stats.currentStreak / 7, 1) * 100} className="h-2" />
                    </div>
                    
                    <div className="p-4 border border-border/50 rounded-xl">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-medium">Reach Level 5</span>
                        <span className="text-sm text-muted-foreground">Level {getLevel(stats.experiencePoints)}/5</span>
                      </div>
                      <Progress value={Math.min(getLevel(stats.experiencePoints) / 5, 1) * 100} className="h-2" />
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </main>
        </div>
      </div>
    </AuthGuard>
  )
}
