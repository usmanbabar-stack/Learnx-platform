"use client"

import { useState, useEffect, useRef } from "react"
import { useSearchParams } from "next/navigation"
import { Navigation } from "@/components/navigation"
import { AuthGuard } from "@/components/auth-guard"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import {
  FileText,
  ArrowLeft,
  Loader2,
  Clock,
  Target,
  BookOpen,
  Lightbulb,
  Play,
  Download,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
} from "lucide-react"
import Link from "next/link"
import { apiService } from "@/lib/api"

interface VideoSummary {
  overview: string
  keyPoints: string[]
  mainTopics: string[]
  keyTimestamps: Array<{ time: string; description: string }>
  targetAudience: string
  difficulty: "beginner" | "intermediate" | "advanced"
  estimatedWatchTime: string
  videoId: string
  generatedAt: string
}

type TranscriptStatus = 'checking' | 'waiting' | 'ready' | 'generating' | 'error'

export default function SummaryPage() {
  const searchParams = useSearchParams()
  const videoId = searchParams.get("videoId") || ""
  
  const [summary, setSummary] = useState<VideoSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [transcriptStatus, setTranscriptStatus] = useState<TranscriptStatus>('checking')
  const [statusMessage, setStatusMessage] = useState("Checking transcript status...")
  const pollingRef = useRef<NodeJS.Timeout | null>(null)
  // Prevent duplicate API calls from React StrictMode
  const isLoadingRef = useRef(false)

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (videoId && !isLoadingRef.current) {
      checkAndLoadSummary()
    } else if (!videoId) {
      setLoading(false)
      setTranscriptStatus('error')
      setError("No video selected. Please go back and select a video.")
    }
  }, [videoId])

  const checkAndLoadSummary = async () => {
    // Prevent duplicate calls
    if (isLoadingRef.current) return
    isLoadingRef.current = true
    
    setLoading(true)
    setError(null)
    setTranscriptStatus('checking')
    setStatusMessage("Checking transcript status...")

    // First, check if transcript is ready
    try {
      const status = await apiService.checkTranscriptStatus(videoId)
      
      if (status.success && status.data?.ready) {
        // Transcript is ready, load summary
        setTranscriptStatus('generating')
        setStatusMessage("Generating AI summary...")
        await loadSummary()
      } else {
        // Transcript not ready, start polling
        setTranscriptStatus('waiting')
        setStatusMessage(status.data?.message || "Waiting for transcript to be ready...")
        startPolling()
      }
    } catch (err) {
      console.error("Status check error:", err)
      // Try to load summary anyway - it might be cached
      setTranscriptStatus('generating')
      await loadSummary()
    }
  }

  const startPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
    }

    let pollCount = 0
    const maxPolls = 90 // 3 minutes (90 * 2s)

    pollingRef.current = setInterval(async () => {
      pollCount++
      
      try {
        const status = await apiService.checkTranscriptStatus(videoId)
        
        if (status.success && status.data?.ready) {
          // Transcript ready! Stop polling and load summary
          if (pollingRef.current) {
            clearInterval(pollingRef.current)
            pollingRef.current = null
          }
          setTranscriptStatus('generating')
          setStatusMessage("Transcript ready! Generating AI summary...")
          await loadSummary()
        } else {
          // Update status message
          const elapsed = pollCount * 2
          if (elapsed < 30) {
            setStatusMessage("Processing video transcript...")
          } else if (elapsed < 60) {
            setStatusMessage("Extracting subtitles... (this may take a minute)")
          } else if (elapsed < 120) {
            setStatusMessage("Indexing content... (almost ready)")
          } else {
            setStatusMessage("Still processing... (large video)")
          }
        }
      } catch (e) {
        console.log("Polling error, continuing...")
      }

      if (pollCount >= maxPolls) {
        if (pollingRef.current) {
          clearInterval(pollingRef.current)
          pollingRef.current = null
        }
        setTranscriptStatus('error')
        setError("Transcript processing timed out. Please try again later.")
        setLoading(false)
      }
    }, 2000)
  }

  const loadSummary = async () => {
    setLoading(true)
    setError(null)
    
    try {
      const response = await apiService.getVideoSummary(videoId)
      if (response.success && response.data) {
        setSummary(response.data)
        setTranscriptStatus('ready')
        setStatusMessage("Summary ready!")
      } else {
        // Check for error messages indicating pending transcript
        if (response.message?.includes('pending') || response.message?.includes('not ready')) {
          setTranscriptStatus('waiting')
          setStatusMessage("Transcript is still processing...")
          startPolling()
          return
        } else {
          setTranscriptStatus('error')
          setError(response.message || "Failed to generate summary. Please try again.")
        }
      }
    } catch (err: any) {
      console.error("Summary error:", err)
      // Handle transcript pending status from error response
      if (err.message?.includes('Transcript not ready') || err.message?.includes('pending')) {
        setTranscriptStatus('waiting')
        setStatusMessage("Transcript is still processing...")
        startPolling()
        return
      } else {
        setTranscriptStatus('error')
        setError(err.message || "Failed to load summary")
      }
    } finally {
      setLoading(false)
    }
  }

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case "beginner":
        return "bg-green-500"
      case "intermediate":
        return "bg-yellow-500"
      case "advanced":
        return "bg-red-500"
      default:
        return "bg-gray-500"
    }
  }

  const exportSummary = () => {
    if (!summary) return
    
    const content = `VIDEO SUMMARY
================

OVERVIEW:
${summary.overview}

KEY POINTS:
${summary.keyPoints.map((point, i) => `${i + 1}. ${point}`).join("\n")}

MAIN TOPICS:
${summary.mainTopics.join(", ")}

KEY TIMESTAMPS:
${summary.keyTimestamps.map(ts => `[${ts.time}] ${ts.description}`).join("\n")}

TARGET AUDIENCE: ${summary.targetAudience}
DIFFICULTY: ${summary.difficulty}
ESTIMATED WATCH TIME: ${summary.estimatedWatchTime}

Generated: ${new Date(summary.generatedAt).toLocaleString()}
`
    
    const blob = new Blob([content], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `summary-${videoId}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <AuthGuard>
      <div className="min-h-screen bg-background relative">
        <div className="absolute inset-0 mesh-gradient pointer-events-none" />
        <div className="relative z-10">
        <Navigation />

        <div className="container mx-auto px-4 py-6 max-w-5xl">
          {/* Header */}
          <div className="mb-6 animate-slide-up">
            <Button variant="ghost" size="sm" asChild className="mb-4 hover:bg-muted/50">
              <Link href={videoId ? `/learn/${videoId}` : "/learn"}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Video
              </Link>
            </Button>

            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-black font-montserrat flex items-center gap-2">
                  <FileText className="w-8 h-8 text-primary" />
                  <span className="gradient-text">Summary</span>
                </h1>
                <p className="text-muted-foreground font-open-sans mt-2">
                  AI-generated key points from this video
                </p>
              </div>
              <div className="flex items-center gap-3">
                {/* Status Indicator */}
                <div className="flex items-center gap-2">
                  {transcriptStatus === 'ready' && (
                    <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/30">
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      Ready
                    </Badge>
                  )}
                  {transcriptStatus === 'waiting' && (
                    <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500 border-yellow-500/30">
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      Waiting for transcript
                    </Badge>
                  )}
                  {transcriptStatus === 'generating' && (
                    <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/30">
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      Generating
                    </Badge>
                  )}
                  {transcriptStatus === 'checking' && (
                    <Badge variant="outline" className="bg-gray-500/10 text-gray-400 border-gray-500/30">
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      Checking
                    </Badge>
                  )}
                </div>
                {summary && (
                  <div className="flex gap-2">
                    <Button onClick={() => checkAndLoadSummary()} variant="outline" size="sm">
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Refresh
                    </Button>
                    <Button onClick={exportSummary} variant="outline" size="sm">
                      <Download className="w-4 h-4 mr-2" />
                      Export
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Waiting for Transcript State */}
          {transcriptStatus === 'waiting' && (
            <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
              <CardContent className="py-12">
                <div className="flex flex-col items-center justify-center">
                  <Loader2 className="w-8 h-8 animate-spin text-yellow-500 mb-4" />
                  <h3 className="text-lg font-bold font-montserrat mb-2">Waiting for Transcript</h3>
                  <p className="text-muted-foreground font-open-sans text-center max-w-md">
                    {statusMessage}
                  </p>
                  <p className="text-xs text-muted-foreground mt-4">
                    This will automatically refresh when ready
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Loading/Generating State */}
          {loading && transcriptStatus !== 'waiting' && (
            <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
              <CardContent className="py-12">
                <div className="flex flex-col items-center justify-center">
                  <Loader2 className="w-8 h-8 animate-spin text-accent mb-4" />
                  <p className="text-muted-foreground font-open-sans">
                    Generating AI summary... This may take a moment.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Error State */}
          {error && !loading && (
            <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
              <CardContent className="py-12">
                <div className="flex flex-col items-center justify-center text-center">
                  <AlertCircle className="w-12 h-12 text-destructive mb-4" />
                  <h3 className="text-lg font-bold font-montserrat mb-2">Unable to Generate Summary</h3>
                  <p className="text-muted-foreground font-open-sans mb-4">{error}</p>
                  <Button onClick={loadSummary} variant="outline">
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Try Again
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Summary Content */}
          {summary && !loading && (
            <div className="space-y-6">
              {/* Quick Stats */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="border-border/50 bg-card/80 backdrop-blur-sm hover-lift">
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <div className="stat-icon-purple p-2 rounded-xl">
                        <Clock className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Watch Time</p>
                        <p className="font-bold font-montserrat">{summary.estimatedWatchTime}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-border/50 bg-card/80 backdrop-blur-sm hover-lift">
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <div className="stat-icon-amber p-2 rounded-xl">
                        <Target className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Difficulty</p>
                        <Badge className={getDifficultyColor(summary.difficulty)}>
                          {summary.difficulty.charAt(0).toUpperCase() + summary.difficulty.slice(1)}
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-border/50 bg-card/80 backdrop-blur-sm hover-lift">
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <div className="stat-icon-emerald p-2 rounded-xl">
                        <BookOpen className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Target Audience</p>
                        <p className="font-medium font-open-sans text-sm">{summary.targetAudience}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Overview */}
              <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="font-montserrat flex items-center gap-2">
                    <FileText className="w-5 h-5 text-primary" />
                    Overview
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground font-open-sans leading-relaxed">
                    {summary.overview}
                  </p>
                </CardContent>
              </Card>

              {/* Key Points */}
              <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="font-montserrat flex items-center gap-2">
                    <Lightbulb className="w-5 h-5 text-primary" />
                    Key Points
                  </CardTitle>
                  <CardDescription>
                    Main takeaways from the video
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3">
                    {summary.keyPoints.map((point, index) => (
                      <li key={index} className="flex gap-3">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">
                          {index + 1}
                        </span>
                        <p className="font-open-sans text-muted-foreground">{point}</p>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              {/* Main Topics */}
              <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="font-montserrat flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-primary" />
                    Main Topics
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {summary.mainTopics.map((topic, index) => (
                      <Badge key={index} variant="secondary" className="text-sm">
                        {topic}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Key Timestamps */}
              {summary.keyTimestamps.length > 0 && (
                <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
                  <CardHeader>
                    <CardTitle className="font-montserrat flex items-center gap-2">
                      <Play className="w-5 h-5 text-primary" />
                      Key Moments
                    </CardTitle>
                    <CardDescription>
                      Important timestamps in the video
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {summary.keyTimestamps.map((timestamp, index) => (
                        <div key={index} className="flex items-start gap-3">
                          <Link
                            href={`/learn/${videoId}?t=${timestamp.time}`}
                            className="flex-shrink-0"
                          >
                            <Badge variant="outline" className="font-mono hover:bg-accent hover:text-accent-foreground cursor-pointer">
                              {timestamp.time}
                            </Badge>
                          </Link>
                          <p className="font-open-sans text-muted-foreground">
                            {timestamp.description}
                          </p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Footer */}
              <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
                <CardContent className="pt-6">
                  <p className="text-xs text-muted-foreground text-center font-open-sans">
                    Summary generated on {new Date(summary.generatedAt).toLocaleString()}
                  </p>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
        </div>
      </div>
    </AuthGuard>
  )
}
