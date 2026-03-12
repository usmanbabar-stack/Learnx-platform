"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { 
  ArrowLeft, 
  Download, 
  FileText, 
  HelpCircle, 
  Clock, 
  BookOpen, 
  Eye,
  Loader2,
  CheckCircle,
  XCircle,
  AlertCircle
} from "lucide-react"
import Link from "next/link"
import { AuthGuard } from "@/components/auth-guard"
import { Navigation } from "@/components/navigation"
import { apiService } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"

interface Lecture {
  id: number;
  title: string;
  description: string;
  status: 'processing' | 'completed' | 'failed' | 'draft';
  subject: string;
  difficulty: string;
  visibility: string;
  view_count: number;
  duration: string;
  file_size: number;
  file_path: string;
  transcript_text?: string;
  created_at: string;
  updated_at: string;
}

interface Note {
  id: number;
  lecture_id: number;
  content: string;
  summary_type: 'detailed' | 'quick' | 'outline';
  word_count: number;
  created_at: string;
}

interface QuestionBank {
  id: number;
  lecture_id: number;
  questions: any[];
  difficulty: string;
  total_questions: number;
  question_type: string;
  created_at: string;
}

export default function LectureDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { toast } = useToast()
  const lectureId = parseInt(params.id as string)

  const [lecture, setLecture] = useState<Lecture | null>(null)
  const [notes, setNotes] = useState<Note[]>([])
  const [questionBank, setQuestionBank] = useState<QuestionBank | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchLectureDetails = async () => {
      try {
        setLoading(true)
        
        // Fetch lecture details
        const lectureResult = await apiService.getTeacherLecture(lectureId)
        
        if (lectureResult.success && lectureResult.data) {
          setLecture(lectureResult.data.lecture)
          setNotes(lectureResult.data.notes || [])
          // Backend returns 'questionBanks' array, get first one
          const questionBanks = lectureResult.data.questionBanks || []
          setQuestionBank(questionBanks.length > 0 ? questionBanks[0] : null)
        } else {
          toast({
            title: "Error",
            description: "Failed to load lecture details",
            variant: "destructive"
          })
          router.push('/teacher')
        }
      } catch (error: any) {
        console.error('Error fetching lecture:', error)
        toast({
          title: "Error",
          description: error.message || "Failed to load lecture",
          variant: "destructive"
        })
        router.push('/teacher')
      } finally {
        setLoading(false)
      }
    }

    fetchLectureDetails()
  }, [lectureId, toast, router])

  const handleDownloadNotes = async (type: 'detailed' | 'quick' | 'outline') => {
    try {
      // API might not support 'outline' type yet, fallback to 'detailed'
      const downloadType = type === 'outline' ? 'detailed' : type
      const blob = await apiService.downloadLectureNotes(lectureId, downloadType)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${lecture?.title}_${type}_notes.md`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      toast({
        title: "Download Started",
        description: `Downloading ${type} notes`,
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

  const handleDownloadQuestions = async () => {
    try {
      const blob = await apiService.downloadLectureQuestions(lectureId)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${lecture?.title}_questions.md`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      toast({
        title: "Download Started",
        description: "Downloading question bank",
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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-600" />
      case 'processing':
        return <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-600" />
      default:
        return <AlertCircle className="w-5 h-5 text-gray-600" />
    }
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
    return date.toLocaleDateString('en-US', { 
      month: 'long', 
      day: 'numeric', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'
    else if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB'
    else if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
    else return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB'
  }

  // Convert markdown-style content to styled React components
  const renderNoteContent = (content: string) => {
    const lines = content.split('\n')
    const elements: JSX.Element[] = []
    
    lines.forEach((line, index) => {
      // Skip empty lines
      if (!line.trim()) {
        elements.push(<div key={index} className="h-2" />)
        return
      }

      // Main title (# Title)
      if (line.startsWith('# ') && !line.startsWith('## ')) {
        elements.push(
          <h1 key={index} className="text-2xl font-black font-montserrat text-foreground mb-4 mt-6">
            {line.substring(2)}
          </h1>
        )
      }
      // Section headers (## Section)
      else if (line.startsWith('## ')) {
        elements.push(
          <h2 key={index} className="text-xl font-bold font-montserrat text-foreground mb-3 mt-5 border-b border-border pb-2">
            {line.substring(3)}
          </h2>
        )
      }
      // Subsection headers (### Subsection)
      else if (line.startsWith('### ')) {
        elements.push(
          <h3 key={index} className="text-lg font-semibold font-montserrat text-foreground mb-2 mt-4">
            {line.substring(4)}
          </h3>
        )
      }
      // Bullet points (- item or * item)
      else if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
        const content = line.trim().substring(2)
        elements.push(
          <div key={index} className="flex items-start gap-3 mb-2 ml-4">
            <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
            <p className="text-sm font-open-sans text-foreground leading-relaxed flex-1">
              {parseInlineFormatting(content)}
            </p>
          </div>
        )
      }
      // Timestamps (**00:00**)
      else if (line.trim().startsWith('**') && line.includes('**:')) {
        const match = line.match(/\*\*(.+?)\*\*:\s*(.+)/)
        if (match) {
          elements.push(
            <div key={index} className="flex items-start gap-3 mb-2 ml-4 bg-primary/5 p-3 rounded-lg border-l-2 border-primary">
              <Clock className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
              <div>
                <span className="font-bold text-primary text-sm">{match[1]}</span>
                <span className="text-sm font-open-sans text-foreground ml-2">
                  {parseInlineFormatting(match[2])}
                </span>
              </div>
            </div>
          )
        }
      }
      // Special fields (Difficulty, Target Audience, etc.)
      else if (line.trim().startsWith('**') && line.includes(':**')) {
        const match = line.match(/\*\*(.+?):\*\*\s*(.+)/)
        if (match) {
          elements.push(
            <div key={index} className="flex items-start gap-2 mb-2 ml-4">
              <span className="font-bold text-sm font-montserrat text-primary">
                {match[1]}:
              </span>
              <span className="text-sm font-open-sans text-foreground">
                {parseInlineFormatting(match[2])}
              </span>
            </div>
          )
        }
      }
      // Regular paragraphs
      else {
        elements.push(
          <p key={index} className="text-sm font-open-sans text-foreground leading-relaxed mb-3">
            {parseInlineFormatting(line)}
          </p>
        )
      }
    })

    return <div className="space-y-1">{elements}</div>
  }

  // Helper function to parse inline formatting (bold, italic, etc.)
  const parseInlineFormatting = (text: string) => {
    const parts: (string | JSX.Element)[] = []
    let currentIndex = 0
    let key = 0

    // Match **bold**, *italic*, and `code`
    const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g
    let match

    while ((match = regex.exec(text)) !== null) {
      // Add text before match
      if (match.index > currentIndex) {
        parts.push(text.substring(currentIndex, match.index))
      }

      // Add formatted text
      if (match[2]) {
        // Bold
        parts.push(
          <strong key={key++} className="font-bold text-foreground">
            {match[2]}
          </strong>
        )
      } else if (match[3]) {
        // Italic
        parts.push(
          <em key={key++} className="italic text-foreground">
            {match[3]}
          </em>
        )
      } else if (match[4]) {
        // Code
        parts.push(
          <code key={key++} className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">
            {match[4]}
          </code>
        )
      }

      currentIndex = match.index + match[0].length
    }

    // Add remaining text
    if (currentIndex < text.length) {
      parts.push(text.substring(currentIndex))
    }

    return parts.length > 0 ? parts : text
  }

  // Render question bank with beautiful styling
  const renderQuestionBank = (questions: any[]) => {
    return questions.map((q: any, idx: number) => (
      <div 
        key={idx} 
        className="bg-gradient-to-br from-background to-muted/10 rounded-lg p-5 border border-border shadow-sm hover:shadow-md transition-shadow"
      >
        {/* Question Header */}
        <div className="flex items-start gap-3 mb-4">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-sm font-bold text-primary">{idx + 1}</span>
          </div>
          <div className="flex-1">
            <p className="text-base font-semibold text-foreground font-montserrat leading-relaxed">
              {q.question}
            </p>
            {q.timestamp && (
              <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                <Clock className="w-3 h-3" />
                <span>{q.timestamp}</span>
              </div>
            )}
          </div>
          <Badge variant="outline" className="text-xs">
            {q.difficulty || 'medium'}
          </Badge>
        </div>

        {/* Options */}
        <div className="space-y-2 mb-4 ml-11">
          {q.options?.map((opt: string, optIdx: number) => {
            const isCorrect = q.correctAnswer === optIdx
            return (
              <div 
                key={optIdx}
                className={`flex items-start gap-3 p-3 rounded-lg border transition-all ${
                  isCorrect 
                    ? 'bg-green-50 dark:bg-green-950/20 border-green-500/40 shadow-sm' 
                    : 'bg-muted/30 border-muted-foreground/20'
                }`}
              >
                <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  isCorrect 
                    ? 'bg-green-500 text-white' 
                    : 'bg-muted-foreground/20 text-muted-foreground'
                }`}>
                  {String.fromCharCode(65 + optIdx)}
                </div>
                <span className={`text-sm font-open-sans flex-1 ${
                  isCorrect 
                    ? 'text-green-700 dark:text-green-400 font-semibold' 
                    : 'text-foreground'
                }`}>
                  {opt}
                </span>
                {isCorrect && (
                  <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                )}
              </div>
            )
          })}
        </div>

        {/* Explanation */}
        {q.explanation && (
          <div className="ml-11 p-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-500/30 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-1">Explanation</p>
                <p className="text-sm text-foreground/90 font-open-sans leading-relaxed">
                  {q.explanation}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Category Badge */}
        {q.category && (
          <div className="ml-11 mt-3 flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              {q.category}
            </Badge>
          </div>
        )}
      </div>
    ))
  }

  // Render transcript with better formatting
  const renderTranscript = (text: string) => {
    // Split into paragraphs for better readability
    const paragraphs = text.split(/\n\n+/).filter(p => p.trim())
    
    if (paragraphs.length === 0) {
      return <p className="text-sm font-open-sans text-foreground leading-relaxed">{text}</p>
    }

    return (
      <div className="space-y-4">
        {paragraphs.map((para, idx) => (
          <p 
            key={idx} 
            className="text-sm font-open-sans text-foreground leading-relaxed"
          >
            {para.trim()}
          </p>
        ))}
      </div>
    )
  }

  // Check if lecture is video/audio (has actual duration, not document)
  const isVideoOrAudio = lecture && lecture.duration && lecture.duration !== 'N/A'

  if (loading) {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" />
            <p className="text-muted-foreground">Loading lecture details...</p>
          </div>
        </div>
      </AuthGuard>
    )
  }

  if (!lecture) {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="text-center">
            <p className="text-muted-foreground">Lecture not found</p>
            <Button asChild className="mt-4">
              <Link href="/teacher">Back to Dashboard</Link>
            </Button>
          </div>
        </div>
      </AuthGuard>
    )
  }

  return (
    <AuthGuard>
      <div className="min-h-screen bg-background">
        <Navigation />
        {/* Header */}
        <div className="border-b border-border bg-card/50 backdrop-blur-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/teacher">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Dashboard
                  </Link>
                </Button>
                <div>
                  <div className="flex items-center gap-3">
                    <h1 className="text-2xl font-black font-montserrat">{lecture.title}</h1>
                    <Badge variant={getStatusColor(lecture.status)}>
                      <span className="flex items-center gap-1">
                        {getStatusIcon(lecture.status)}
                        {lecture.status}
                      </span>
                    </Badge>
                  </div>
                  <p className="text-muted-foreground font-open-sans mt-1">
                    {lecture.description || 'No description provided'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
          {/* Lecture Info Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Subject</CardTitle>
                <BookOpen className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{lecture.subject}</div>
                <p className="text-xs text-muted-foreground">
                  {lecture.difficulty}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Duration</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{lecture.duration || 'N/A'}</div>
                <p className="text-xs text-muted-foreground">
                  {formatFileSize(lecture.file_size)}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Views</CardTitle>
                <Eye className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{lecture.view_count}</div>
                <p className="text-xs text-muted-foreground">
                  Total views
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Created</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-sm font-bold">{formatDate(lecture.created_at)}</div>
                <p className="text-xs text-muted-foreground">
                  {lecture.visibility}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Content Tabs */}
          <Tabs defaultValue="notes" className="w-full">
            <TabsList className={`grid w-full ${isVideoOrAudio ? 'grid-cols-3' : 'grid-cols-2'}`}>
              <TabsTrigger value="notes">Generated Notes</TabsTrigger>
              <TabsTrigger value="questions">Question Bank</TabsTrigger>
              {isVideoOrAudio && (
                <TabsTrigger value="transcript">Transcript</TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="notes" className="space-y-4">
              {notes.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <FileText className="w-12 h-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No Notes Generated Yet</h3>
                    <p className="text-muted-foreground text-center">
                      {lecture.status === 'processing' 
                        ? 'Notes are being generated. Please wait...'
                        : 'Notes will be generated after processing completes.'}
                    </p>
                  </CardContent>
                </Card>
              ) : (
                notes.map((note) => (
                  <Card key={note.id}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="font-montserrat">
                            {note.summary_type === 'detailed' 
                              ? 'Detailed Notes' 
                              : note.summary_type === 'quick' 
                                ? 'Quick Summary' 
                                : 'Outline'}
                          </CardTitle>
                          <CardDescription className="font-open-sans">
                            {note.word_count} words · Generated on {formatDate(note.created_at)}
                          </CardDescription>
                        </div>
                        <Button 
                          onClick={() => handleDownloadNotes(note.summary_type)}
                          variant="outline"
                          size="sm"
                        >
                          <Download className="w-4 h-4 mr-2" />
                          Download
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="bg-gradient-to-br from-background to-muted/20 rounded-lg p-6 border border-border shadow-sm">
                        <div className="max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                          {renderNoteContent(note.content)}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>

            <TabsContent value="questions" className="space-y-4">
              {!questionBank ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <HelpCircle className="w-12 h-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No Questions Generated Yet</h3>
                    <p className="text-muted-foreground text-center">
                      {lecture.status === 'processing' 
                        ? 'Questions are being generated. Please wait...'
                        : 'Questions will be generated after processing completes.'}
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="font-montserrat">Question Bank</CardTitle>
                        <CardDescription className="font-open-sans">
                          {questionBank.total_questions} questions · {questionBank.difficulty} · Generated on {formatDate(questionBank.created_at)}
                        </CardDescription>
                      </div>
                      <Button 
                        onClick={handleDownloadQuestions}
                        variant="outline"
                        size="sm"
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Download
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="bg-gradient-to-br from-background to-muted/20 rounded-lg p-6 border border-border shadow-sm">
                      <div className="max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                        <div className="space-y-4">
                          {renderQuestionBank(questionBank.questions.slice(0, 10))}
                        </div>
                        {questionBank.questions.length > 10 && (
                          <div className="mt-6 p-4 bg-muted/50 rounded-lg text-center border border-dashed border-muted-foreground/30">
                            <p className="text-sm text-muted-foreground font-open-sans">
                              <strong className="text-foreground">{questionBank.questions.length - 10}</strong> more questions available
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              Click download to view the complete question bank
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {isVideoOrAudio && (
              <TabsContent value="transcript" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="font-montserrat">Transcript</CardTitle>
                    <CardDescription className="font-open-sans">
                      {lecture.transcript_text 
                        ? `${lecture.transcript_text.split(' ').filter(w => w.length > 0).length.toLocaleString()} words extracted from ${lecture.duration}`
                        : 'No transcript available'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {lecture.transcript_text ? (
                      <div className="bg-gradient-to-br from-background to-muted/20 rounded-lg p-6 border border-border shadow-sm">
                        <div className="max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                          {renderTranscript(lecture.transcript_text)}
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-12">
                        <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                        <p className="text-muted-foreground font-open-sans">
                          {lecture.status === 'processing' 
                            ? 'Transcript is being generated...'
                            : 'No transcript available for this lecture.'}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            )}
          </Tabs>
        </div>
      </div>
    </AuthGuard>
  )
}
