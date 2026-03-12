"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Progress } from "@/components/ui/progress"
import {
  ArrowLeft,
  TrendingUp,
  BarChart3,
  Target,
  Award,
  BookOpen,
  CheckCircle,
  AlertTriangle,
  AlertCircle,
  Lightbulb,
  FileText,
  Brain,
  Loader2
} from "lucide-react"
import Link from "next/link"
import { AuthGuard } from "@/components/auth-guard"
import { Navigation } from "@/components/navigation"
import { safeStorage } from "@/lib/api"

interface AnalysisSession {
  id: number;
  session_name: string;
  total_papers: number;
  total_questions: number;
  analysis_date: string;
  status: 'processing' | 'completed' | 'failed';
  topic_frequency: { [topic: string]: number };
  difficulty_distribution: { easy: number; medium: number; hard: number };
  question_type_distribution: { [type: string]: number };
  bloom_distribution: { [level: string]: number };
  patterns: Array<{
    pattern_type: string;
    description: string;
    frequency: number;
    importance: 'high' | 'medium' | 'low';
  }>;
  weak_areas: Array<{
    topic: string;
    frequency: number;
    recommendation: string;
  }>;
  strong_areas: Array<{
    topic: string;
    coverage: string;
  }>;
  recommendations: Array<{
    priority: 'high' | 'medium' | 'low';
    area: string;
    action: string;
  }>;
  practice_questions: any[];
}

export default function AnalysisResultsPage() {
  const params = useParams()
  const router = useRouter()
  const sessionId = params.sessionId as string
  
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<AnalysisSession | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const MAX_RETRIES = 40 // 40 retries * 3 seconds = 2 minutes

  useEffect(() => {
    // Load analysis data from backend API
    const loadSession = async () => {
      try {
        setLoading(true)
        
        const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'
        const token = safeStorage.getItem('auth-token')
        
        if (!token) {
          safeStorage.removeItem('learnx_user')
          router.push('/login')
          return
        }
        
        const response = await fetch(`${API_BASE_URL}/past-papers/sessions/${sessionId}`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        })

        if (!response.ok) {
          if (response.status === 401) {
            // Authentication error - clear and redirect
            safeStorage.removeItem('auth-token')
            safeStorage.removeItem('learnx_user')
            router.push('/login')
            return
          }
          throw new Error('Failed to load session data')
        }

        const result = await response.json()
        const sessionData = result.data.session
        
        // Check if session failed
        if (sessionData.status === 'failed') {
          setError('Analysis failed. The uploaded papers could not be processed. Please try again.')
          setIsProcessing(false)
          return
        }
        
        // Check if session is still processing
        if (sessionData.status === 'processing' || !sessionData.topic_frequency || !sessionData.patterns) {
          setIsProcessing(true)
          
          // Check max retries
          if (retryCount >= MAX_RETRIES) {
            setError('Analysis is taking too long. Please try again or contact support.')
            setIsProcessing(false)
            return
          }
          
          // Increment retry count and retry after 3 seconds
          setRetryCount(prev => prev + 1)
          // Increment retry count and retry after 3 seconds
          setRetryCount(prev => prev + 1)
          setTimeout(() => loadSession(), 3000)
        } else {
          setSession(sessionData)
          setIsProcessing(false)
        }
      } catch (error) {
        console.error('Failed to load session:', error)
        setError('Failed to load session data. Please try again.')
        setIsProcessing(false)
      } finally {
        setLoading(false)
      }
    }

    loadSession()
  }, [sessionId, router])

  const getImportanceColor = (importance: string) => {
    switch (importance) {
      case 'high': return 'text-red-600 dark:text-red-400'
      case 'medium': return 'text-yellow-600 dark:text-yellow-400'
      case 'low': return 'text-green-600 dark:text-green-400'
      default: return 'text-gray-600'
    }
  }

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'high':
        return <Badge variant="destructive" className="text-xs">High Priority</Badge>
      case 'medium':
        return <Badge variant="default" className="text-xs">Medium Priority</Badge>
      case 'low':
        return <Badge variant="secondary" className="text-xs">Low Priority</Badge>
      default:
        return null
    }
  }

  if (error) {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-background relative">
          <div className="absolute inset-0 mesh-gradient pointer-events-none" />
          <div className="relative z-10">
          <Navigation />
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="text-center max-w-md">
              <AlertCircle className="w-12 h-12 mx-auto mb-4 text-destructive" />
              <h2 className="text-2xl font-bold mb-2 font-montserrat">Analysis Failed</h2>
              <p className="text-muted-foreground mb-6 font-open-sans">{error}</p>
              <Button onClick={() => router.push('/past-paper-analyzer')} className="font-semibold bg-gradient-to-r from-primary to-chart-5 hover:opacity-90 shadow-md shadow-primary/20">
                Back to Upload
              </Button>
            </div>
          </div>
          </div>
        </div>
      </AuthGuard>
    )
  }

  if (loading || isProcessing) {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-background relative">
          <div className="absolute inset-0 mesh-gradient pointer-events-none" />
          <div className="relative z-10">
          <Navigation />
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="text-center">
              <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-primary" />
              <p className="text-lg font-semibold font-montserrat">
                {loading ? 'Loading Analysis...' : 'Processing Past Papers...'}
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                {loading 
                  ? 'Fetching your session data...'
                  : 'AI is extracting questions and detecting patterns. This may take a few minutes.'}
              </p>
              {isProcessing && (
                <p className="text-xs text-muted-foreground mt-4">
                  Page will auto-refresh when ready...
                </p>
              )}
            </div>
          </div>
          </div>
        </div>
      </AuthGuard>
    )
  }

  if (!session) {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-background relative">
          <div className="absolute inset-0 mesh-gradient pointer-events-none" />
          <div className="relative z-10">
          <Navigation />
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="text-center">
              <p className="text-lg font-semibold font-montserrat">Analysis Not Found</p>
              <Button asChild className="mt-4 font-semibold bg-gradient-to-r from-primary to-chart-5 hover:opacity-90 shadow-md shadow-primary/20">
                <Link href="/past-paper-analyzer">Back to Upload</Link>
              </Button>
            </div>
          </div>
          </div>
        </div>
      </AuthGuard>
    )
  }

  return (
    <AuthGuard>
      <div className="min-h-screen bg-background relative">
        <div className="absolute inset-0 mesh-gradient pointer-events-none" />
        <div className="relative z-10">
        <Navigation />
        
        {/* Header */}
        <div className="border-b border-border/50 glass">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <Button variant="ghost" size="sm" asChild className="hover:bg-muted/50">
                  <Link href="/past-paper-analyzer">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back
                  </Link>
                </Button>
                <div>
                  <div className="flex items-center gap-3">
                    <h1 className="text-2xl font-black font-montserrat">{session.session_name}</h1>
                    <Badge variant="outline" className="bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-400">
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Completed
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground font-open-sans mt-1">
                    {session.total_papers} papers • {session.total_questions} questions extracted
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <Card className="border-border/50 bg-card/80 backdrop-blur-sm hover-lift">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Questions</p>
                    <p className="text-3xl font-bold mt-1 font-montserrat">{session.total_questions}</p>
                  </div>
                  <div className="stat-icon-blue p-2 rounded-xl">
                    <FileText className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-border/50 bg-card/80 backdrop-blur-sm hover-lift">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Topics Covered</p>
                    <p className="text-3xl font-bold mt-1 font-montserrat">
                      {session.topic_frequency ? Object.keys(session.topic_frequency).length : 0}
                    </p>
                  </div>
                  <div className="stat-icon-emerald p-2 rounded-xl">
                    <BookOpen className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-border/50 bg-card/80 backdrop-blur-sm hover-lift">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Patterns Found</p>
                    <p className="text-3xl font-bold mt-1 font-montserrat">
                      {session.patterns ? session.patterns.length : 0}
                    </p>
                  </div>
                  <div className="stat-icon-purple p-2 rounded-xl">
                    <TrendingUp className="w-8 h-8 text-primary" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-border/50 bg-card/80 backdrop-blur-sm hover-lift">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Focus Areas</p>
                    <p className="text-3xl font-bold mt-1 font-montserrat">
                      {session.weak_areas ? session.weak_areas.length : 0}
                    </p>
                  </div>
                  <div className="stat-icon-rose p-2 rounded-xl">
                    <Target className="w-8 h-8 text-rose-600 dark:text-rose-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Tabs */}
          <Tabs defaultValue="overview" className="space-y-6">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="patterns">Patterns</TabsTrigger>
              <TabsTrigger value="focus">Focus Areas</TabsTrigger>
              <TabsTrigger value="recommendations">Study Plan</TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="space-y-6">
              {/* Topic Frequency */}
              <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="w-5 h-5" />
                    Topic Frequency
                  </CardTitle>
                  <CardDescription>
                    How often each topic appears across all papers
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {session.topic_frequency && Object.entries(session.topic_frequency)
                      .sort((a, b) => b[1] - a[1])
                      .map(([topic, count]) => {
                        const percentage = (count / session.total_questions) * 100
                        return (
                          <div key={topic} className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                              <span className="font-medium">{topic}</span>
                              <span className="text-muted-foreground">
                                {count} questions ({percentage.toFixed(1)}%)
                              </span>
                            </div>
                            <Progress value={percentage} className="h-2" />
                          </div>
                        )
                      })}
                  </div>
                </CardContent>
              </Card>

              {/* Difficulty & Question Types */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
                  <CardHeader>
                    <CardTitle className="text-lg font-montserrat">Difficulty Distribution</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {session.difficulty_distribution && Object.entries(session.difficulty_distribution).map(([level, count]) => {
                        const percentage = (count / session.total_questions) * 100
                        const color = level === 'easy' ? 'bg-green-500' : level === 'medium' ? 'bg-yellow-500' : 'bg-red-500'
                        return (
                          <div key={level} className="space-y-1">
                            <div className="flex items-center justify-between text-sm">
                              <span className="font-medium capitalize">{level}</span>
                              <span className="text-muted-foreground">{count} ({percentage.toFixed(0)}%)</span>
                            </div>
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                              <div className={`h-full ${color}`} style={{ width: `${percentage}%` }} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
                  <CardHeader>
                    <CardTitle className="text-lg font-montserrat">Question Types</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {session.question_type_distribution && Object.entries(session.question_type_distribution)
                        .sort((a, b) => b[1] - a[1])
                        .map(([type, count]) => {
                          const percentage = (count / session.total_questions) * 100
                          return (
                            <div key={type} className="flex items-center justify-between">
                              <span className="text-sm font-medium capitalize">{type.replace('-', ' ')}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-muted-foreground">{count}</span>
                                <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                                  <div className="h-full bg-primary" style={{ width: `${percentage}%` }} />
                                </div>
                              </div>
                            </div>
                          )
                        })}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Patterns Tab */}
            <TabsContent value="patterns" className="space-y-4">
              {session.patterns && session.patterns.map((pattern, idx) => (
                <Card key={idx} className="border-border/50 bg-card/80 backdrop-blur-sm hover-lift">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <Brain className={`w-5 h-5 mt-0.5 ${getImportanceColor(pattern.importance)}`} />
                        <div>
                          <CardTitle className="text-lg">{pattern.pattern_type}</CardTitle>
                          <CardDescription className="mt-1">{pattern.description}</CardDescription>
                        </div>
                      </div>
                      <Badge variant={pattern.importance === 'high' ? 'destructive' : pattern.importance === 'medium' ? 'default' : 'secondary'}>
                        {pattern.importance} importance
                      </Badge>
                    </div>
                  </CardHeader>
                </Card>
              ))}
            </TabsContent>

            {/* Focus Areas Tab */}
            <TabsContent value="focus" className="space-y-6">
              <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-red-600" />
                    Priority Focus Areas
                  </CardTitle>
                  <CardDescription>
                    Topics that appear most frequently - prioritize these in your study plan
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {session.weak_areas && session.weak_areas.map((area, idx) => (
                      <div key={idx} className="p-4 border border-border/50 rounded-xl bg-gradient-to-r from-red-500/5 to-orange-500/5">
                        <div className="flex items-start justify-between mb-2">
                          <h4 className="font-semibold text-lg">{area.topic}</h4>
                          <Badge variant="outline">{area.frequency} questions</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{area.recommendation}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {session.strong_areas && session.strong_areas.length > 0 && (
                <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Award className="w-5 h-5 text-green-600" />
                      Well-Covered Areas
                    </CardTitle>
                    <CardDescription>
                      Topics with consistent coverage - maintain your understanding
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {session.strong_areas.map((area, idx) => (
                        <div key={idx} className="p-3 border border-border/50 rounded-xl bg-emerald-500/5">
                          <h4 className="font-semibold text-sm mb-1">{area.topic}</h4>
                          <p className="text-xs text-muted-foreground">{area.coverage}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* Recommendations Tab */}
            <TabsContent value="recommendations" className="space-y-4">
              <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Lightbulb className="w-5 h-5 text-yellow-600" />
                    AI-Generated Study Recommendations
                  </CardTitle>
                  <CardDescription>
                    Personalized study plan based on your exam paper analysis
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {session.recommendations && session.recommendations.map((rec, idx) => (
                      <div key={idx} className="p-4 border border-border/50 rounded-xl hover:shadow-md transition-shadow hover-lift">
                        <div className="flex items-start justify-between mb-2">
                          <h4 className="font-semibold">{rec.area}</h4>
                          {getPriorityBadge(rec.priority)}
                        </div>
                        <p className="text-sm text-muted-foreground">{rec.action}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
        </div>
      </div>
    </AuthGuard>
  )
}
