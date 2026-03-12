"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Upload, BookOpen, Eye, FileText, HelpCircle, Loader2, AlertCircle, Download, MoreVertical } from "lucide-react"
import Link from "next/link"
import { AuthGuard } from "@/components/auth-guard"
import { Navigation } from "@/components/navigation"
import { apiService } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"

interface TeacherStats {
  total_lectures: string;
  completed_lectures: string;
  processing_lectures: string;
  failed_lectures: string;
  total_views: string;
  total_notes: string;
  total_question_banks: string;
}

interface Lecture {
  id: number;
  title: string;
  description: string;
  status: 'processing' | 'completed' | 'failed' | 'draft';
  subject: string;
  difficulty: string;
  view_count: number;
  duration: string;
  created_at: string;
  notes_count: string;
  question_banks_count: string;
}

export default function TeacherDashboardPage() {
  const [stats, setStats] = useState<TeacherStats | null>(null)
  const [lectures, setLectures] = useState<Lecture[]>([])
  const [loading, setLoading] = useState(true)
  const { toast } = useToast()
  const [userData, setUserData] = useState<any>(null)

  useEffect(() => {
    const storedUser = localStorage.getItem("learnx_user")
    if (storedUser) {
      try {
        setUserData(JSON.parse(storedUser))
      } catch (e) {
        console.error('Failed to parse user data:', e)
      }
    }
  }, [])

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)
        
        const [statsResult, lecturesResult] = await Promise.all([
          apiService.getTeacherStats(),
          apiService.getTeacherLectures()
        ])

        if (statsResult.success && statsResult.data) {
          setStats(statsResult.data.stats)
        }

        if (lecturesResult.success && lecturesResult.data) {
          setLectures(lecturesResult.data.lectures)
        }
      } catch (error: any) {
        console.error('Error fetching teacher data:', error)
        toast({
          title: "Error",
          description: error.message || "Failed to load teacher data",
          variant: "destructive"
        })
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [toast])

  const handleDownloadNotes = async (lectureId: number, type: 'detailed' | 'quick', title: string) => {
    try {
      const blob = await apiService.downloadLectureNotes(lectureId, type)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${title}_${type}_notes.md`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      toast({
        title: "Download Started",
        description: `Downloading ${type} notes for ${title}`,
      })
    } catch (error: any) {
      console.error('Download error:', error)
      toast({
        title: "Download Failed",
        description: error.message || "Failed to download notes",
        variant: "destructive"
      })
    }
  }

  const handleDownloadQuestions = async (lectureId: number, title: string) => {
    try {
      const blob = await apiService.downloadLectureQuestions(lectureId)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${title}_questions.md`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      toast({
        title: "Download Started",
        description: `Downloading questions for ${title}`,
      })
    } catch (error: any) {
      console.error('Download error:', error)
      toast({
        title: "Download Failed",
        description: error.message || "Failed to download questions",
        variant: "destructive"
      })
    }
  }

  const getInitials = (firstName?: string, lastName?: string, email?: string) => {
    if (firstName && lastName) {
      return `${firstName[0]}${lastName[0]}`.toUpperCase()
    }
    if (email) {
      return email[0].toUpperCase()
    }
    return 'T'
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'default'
      case 'processing': return 'secondary'
      case 'failed': return 'destructive'
      case 'draft': return 'outline'
      default: return 'outline'
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  if (loading) {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" />
            <p className="text-muted-foreground">Loading dashboard...</p>
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
                <Avatar className="w-12 h-12 border-2 border-primary/20 shadow-lg">
                  <AvatarFallback className="bg-gradient-to-br from-primary to-chart-5 text-white font-bold">
                    {getInitials(userData?.firstName, userData?.lastName, userData?.email)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h1 className="text-2xl font-black font-montserrat">
                    Welcome, <span className="gradient-text">{userData?.firstName || 'Teacher'}</span>!
                  </h1>
                  <p className="text-muted-foreground font-open-sans">Manage your lectures and AI-generated content</p>
                </div>
              </div>
              <Button asChild size="lg" className="font-semibold bg-gradient-to-r from-primary to-chart-5 hover:opacity-90 shadow-md shadow-primary/20">
                <Link href="/teacher/upload">
                  <Upload className="w-4 h-4 mr-2" />
                  Upload Lecture
                </Link>
              </Button>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-slide-up">
            <Card className="border-border/50 bg-card/80 backdrop-blur-sm hover-lift">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium font-montserrat">Total Lectures</CardTitle>
                <div className="stat-icon-purple"><BookOpen className="h-4 w-4" /></div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold font-montserrat">
                  {stats?.total_lectures || 0}
                </div>
                <p className="text-xs text-muted-foreground font-open-sans">
                  {stats?.completed_lectures || 0} completed
                </p>
              </CardContent>
            </Card>

            <Card className="border-border/50 bg-card/80 backdrop-blur-sm hover-lift">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium font-montserrat">Notes Generated</CardTitle>
                <div className="stat-icon-emerald"><FileText className="h-4 w-4" /></div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold font-montserrat">
                  {stats?.total_notes || 0}
                </div>
                <p className="text-xs text-muted-foreground font-open-sans">
                  AI-generated summaries
                </p>
              </CardContent>
            </Card>

            <Card className="border-border/50 bg-card/80 backdrop-blur-sm hover-lift">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium font-montserrat">Question Banks</CardTitle>
                <div className="stat-icon-amber"><HelpCircle className="h-4 w-4" /></div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold font-montserrat">
                  {stats?.total_question_banks || 0}
                </div>
                <p className="text-xs text-muted-foreground font-open-sans">
                  AI-generated quizzes
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Lectures List */}
          <Card className="border-border/50 bg-card/80 backdrop-blur-sm animate-slide-up stagger-1">
            <CardHeader>
              <CardTitle className="font-montserrat">My Lectures</CardTitle>
              <CardDescription className="font-open-sans">
                All your uploaded lectures with AI-generated content
              </CardDescription>
            </CardHeader>
            <CardContent>
              {lectures.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-gradient-to-br from-primary/20 to-chart-5/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <BookOpen className="w-8 h-8 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">No lectures yet</h3>
                  <p className="text-muted-foreground mb-4">
                    Upload your first lecture to get started with AI-powered notes and questions
                  </p>
                  <Button asChild className="font-semibold bg-gradient-to-r from-primary to-chart-5 hover:opacity-90 shadow-md shadow-primary/20">
                    <Link href="/teacher/upload">
                      <Upload className="w-4 h-4 mr-2" />
                      Upload Lecture
                    </Link>
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {lectures.map((lecture) => (
                    <div
                      key={lecture.id}
                      className="flex items-center justify-between p-4 border border-border/50 rounded-xl hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <h4 className="font-medium font-montserrat">{lecture.title}</h4>
                          <Badge variant={getStatusColor(lecture.status)}>
                            {lecture.status}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground font-open-sans">
                          <span>{lecture.subject}</span>
                          <span>•</span>
                          <span>{lecture.difficulty}</span>
                          <span>•</span>
                          <span>{lecture.duration || 'N/A'}</span>
                          <span>•</span>
                          <span>{formatDate(lecture.created_at)}</span>
                        </div>
                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                          <span className="flex items-center">
                            <Eye className="w-3 h-3 mr-1" />
                            {lecture.view_count} views
                          </span>
                          <span className="flex items-center">
                            <FileText className="w-3 h-3 mr-1" />
                            {lecture.notes_count} notes
                          </span>
                          <span className="flex items-center">
                            <HelpCircle className="w-3 h-3 mr-1" />
                            {lecture.question_banks_count} question banks
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {lecture.status === 'completed' && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="outline" size="sm" className="border-border/50">
                                <Download className="w-4 h-4 mr-2" />
                                Download
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="border-border/50 bg-card/95 backdrop-blur-xl">
                              <DropdownMenuItem 
                                onClick={() => handleDownloadNotes(lecture.id, 'detailed', lecture.title)}
                                disabled={parseInt(lecture.notes_count) === 0}
                              >
                                <FileText className="w-4 h-4 mr-2" />
                                Detailed Notes
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                onClick={() => handleDownloadNotes(lecture.id, 'quick', lecture.title)}
                                disabled={parseInt(lecture.notes_count) === 0}
                              >
                                <FileText className="w-4 h-4 mr-2" />
                                Quick Notes
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                onClick={() => handleDownloadQuestions(lecture.id, lecture.title)}
                                disabled={parseInt(lecture.question_banks_count) === 0}
                              >
                                <HelpCircle className="w-4 h-4 mr-2" />
                                Question Bank
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                        <Button variant="outline" size="sm" asChild className="border-border/50">
                          <Link href={`/teacher/lectures/${lecture.id}`}>
                            View Details
                          </Link>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Processing Status */}
          {stats && parseInt(stats.processing_lectures) > 0 && (
            <Card className="border-yellow-500/50 bg-yellow-50/80 dark:bg-yellow-950/20 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="font-montserrat flex items-center">
                  <AlertCircle className="w-5 h-5 mr-2 text-yellow-600" />
                  Processing in Progress
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm font-open-sans">
                  You have {stats.processing_lectures} lecture(s) currently being processed. 
                  Transcription and AI content generation may take a few minutes.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
        </div>
      </div>
    </AuthGuard>
  )
}
