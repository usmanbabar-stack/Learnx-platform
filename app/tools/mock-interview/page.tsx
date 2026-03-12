"use client"
import { Navigation } from "@/components/navigation"
import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Mic, MicOff, Video, VideoOff, ArrowLeft, Brain, Play, Pause, RotateCcw, AlertCircle, Loader2, Clock } from "lucide-react"
import Link from "next/link"
import { AuthGuard } from "@/components/auth-guard"
import { apiService } from "@/lib/api"
import { useRouter } from "next/navigation"


interface InterviewQuestion {
  id: string
  question: string
  category: string
  difficulty: "easy" | "medium" | "hard"
  tips: string[]
  followUpQuestions: string[]
  expectedKeyPoints: string[]
}

interface AnswerFeedback {
  score: number
  strengths: string[]
  improvements: string[]
  detailedFeedback: string
  keyPointsCovered: string[]
  keyPointsMissed: string[]
  suggestedAnswer?: string
}

export default function MockInterviewPage() {
  const router = useRouter()
  const [interviewStarted, setInterviewStarted] = useState(false)
  const [currentQuestion, setCurrentQuestion] = useState(0)
  const [customField, setCustomField] = useState("")
  const [selectedDifficulty, setSelectedDifficulty] = useState("")
  const [isRecording, setIsRecording] = useState(false)
  const [videoEnabled, setVideoEnabled] = useState(true)
  const [audioEnabled, setAudioEnabled] = useState(true)
  const [userAnswer, setUserAnswer] = useState("")
  const [showFeedback, setShowFeedback] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isEvaluating, setIsEvaluating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // State for generated interview
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [questions, setQuestions] = useState<InterviewQuestion[]>([])
  const [feedback, setFeedback] = useState<AnswerFeedback | null>(null)
  const [allFeedbacks, setAllFeedbacks] = useState<AnswerFeedback[]>([])
  
  // Get user data from localStorage
  const [userId, setUserId] = useState<number | null>(null)
  
  // Camera and speech recognition state
  const videoRef = useRef<HTMLVideoElement>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const [isCameraActive, setIsCameraActive] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const recognitionRef = useRef<any>(null)
  
  // Timer state (3 minutes per question - standard interview time)
  const [timeRemaining, setTimeRemaining] = useState(180) // 3 minutes in seconds
  const [timerActive, setTimerActive] = useState(false)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  
  // Redirect teachers to their dashboard
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const userStr = localStorage.getItem('learnx_user')
      if (userStr) {
        try {
          const user = JSON.parse(userStr)
          if (user.type === 'teacher') {
            router.push('/teacher')
            return
          }
        } catch (e) {
          console.error('Failed to parse user data:', e)
        }
      }
    }
  }, [router])
  
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Get user from localStorage
      const userStr = localStorage.getItem('learnx_user')
      if (userStr) {
        try {
          const user = JSON.parse(userStr)
          setUserId(user.id)
        } catch (e) {
          console.error('Failed to parse user data:', e)
        }
      }
      
      // Initialize speech recognition
      if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition
        recognitionRef.current = new SpeechRecognition()
        recognitionRef.current.continuous = true
        recognitionRef.current.interimResults = true
        recognitionRef.current.lang = 'en-US'
        
        recognitionRef.current.onresult = (event: any) => {
          let interimTranscript = ''
          let finalTranscript = ''
          
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript
            if (event.results[i].isFinal) {
              finalTranscript += transcript + ' '
            } else {
              interimTranscript += transcript
            }
          }
          
          if (finalTranscript) {
            setUserAnswer(prev => prev + finalTranscript)
          }
        }
        
        recognitionRef.current.onerror = (event: any) => {
          console.error('Speech recognition error:', event.error)
          setIsListening(false)
        }
        
        recognitionRef.current.onend = () => {
          setIsListening(false)
        }
      }
    }
    
    return () => {
      // Cleanup
      if (recognitionRef.current && isListening) {
        recognitionRef.current.stop()
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop())
      }
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }
  }, [])
  
  // Timer effect
  useEffect(() => {
    if (timerActive && timeRemaining > 0) {
      timerRef.current = setInterval(() => {
        setTimeRemaining(prev => {
          if (prev <= 1) {
            setTimerActive(false)
            return 0
          }
          return prev - 1
        })
      }, 1000)
    } else if (timerRef.current) {
      clearInterval(timerRef.current)
    }
    
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }
  }, [timerActive, timeRemaining])
  
  // Ensure video plays when camera becomes active
  useEffect(() => {
    if (isCameraActive && videoRef.current && videoRef.current.srcObject) {
      console.log('Camera is active, attempting to play video...')
      videoRef.current.play().catch(err => {
        console.error('Error playing video in useEffect:', err)
      })
    }
  }, [isCameraActive])
  
  // Start camera
  const startCamera = async () => {
    console.log('startCamera called...')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: true, 
        audio: false 
      })
      console.log('Got media stream:', stream)
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        mediaStreamRef.current = stream
        setIsCameraActive(true)
        console.log('Camera activated, srcObject set')
        // Explicitly play the video to ensure it starts
        try {
          await videoRef.current.play()
          console.log('Video play successful')
        } catch (playErr) {
          console.error('Error playing video:', playErr)
        }
      }
    } catch (err) {
      console.error('Error accessing camera:', err)
      setError('Failed to access camera. Please check permissions.')
    }
  }
  
  // Stop camera
  const stopCamera = () => {
    console.log('stopCamera called')
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => {
        console.log('Stopping track:', track.label)
        track.stop()
      })
      if (videoRef.current) {
        videoRef.current.srcObject = null
      }
      mediaStreamRef.current = null
      setIsCameraActive(false)
      console.log('Camera stopped')
    }
  }
  
  // Toggle camera
  const toggleCamera = async () => {
    console.log('toggleCamera called, current state:', isCameraActive)
    if (isCameraActive) {
      stopCamera()
    } else {
      await startCamera()
    }
  }
  
  // Toggle speech recognition
  const toggleSpeechRecognition = () => {
    if (!recognitionRef.current) {
      setError('Speech recognition not supported in this browser')
      return
    }
    
    if (isListening) {
      recognitionRef.current.stop()
      setIsListening(false)
    } else {
      try {
        recognitionRef.current.start()
        setIsListening(true)
      } catch (err) {
        console.error('Error starting speech recognition:', err)
        setError('Failed to start speech recognition')
      }
    }
  }
  
  // Format time as MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }
  
  // Get timer color based on remaining time
  const getTimerColor = () => {
    if (timeRemaining > 120) return 'text-green-600'
    if (timeRemaining > 60) return 'text-yellow-600'
    return 'text-red-600'
  }

  const currentQ = questions[currentQuestion]

  const handleStartInterview = async () => {
    if (!customField || !selectedDifficulty || !userId) {
      setError("Please fill in all fields")
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      // Call backend API to generate interview with custom field
      const response = await apiService.generateMockInterview({
        field: customField,
        difficulty: selectedDifficulty as 'easy' | 'medium' | 'hard' | 'mixed',
        questionCount: 5,
        userId: userId,
      })

      if (response.success && response.data) {
        setSessionId(response.data.sessionId)
        setQuestions(response.data.questions)
        setInterviewStarted(true)
        setCurrentQuestion(0)
        setTimeRemaining(180) // Set 3 minutes
        setTimerActive(true) // Start timer
        // Start camera automatically
        await startCamera()
      } else {
        setError(response.message || "Failed to generate interview")
      }
    } catch (err: any) {
      console.error('Error generating interview:', err)
      setError(err.message || "Failed to generate interview. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmitAnswer = async () => {
    if (!userAnswer.trim() || !sessionId || !currentQ) {
      return
    }

    setIsEvaluating(true)
    setError(null)

    try {
      // Call backend API to evaluate answer
      const response = await apiService.evaluateInterviewAnswer({
        sessionId: sessionId,
        questionId: currentQ.id,
        question: currentQ.question,
        userAnswer: userAnswer,
        expectedKeyPoints: currentQ.expectedKeyPoints,
        field: customField,
      })

      if (response.success && response.data) {
        setFeedback(response.data)
        setAllFeedbacks([...allFeedbacks, response.data])
        setShowFeedback(true)
      } else {
        setError(response.message || "Failed to evaluate answer")
      }
    } catch (err: any) {
      console.error('Error evaluating answer:', err)
      setError(err.message || "Failed to evaluate answer. Please try again.")
    } finally {
      setIsEvaluating(false)
    }
  }

  const handleNextQuestion = async () => {
    // Stop timer and speech recognition
    setTimerActive(false)
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop()
    }
    
    if (currentQuestion < questions.length - 1) {
      setCurrentQuestion(currentQuestion + 1)
      setUserAnswer("")
      setShowFeedback(false)
      setFeedback(null)
      setTimeRemaining(180) // Reset timer to 3 minutes
      setTimerActive(true) // Start timer for next question
    } else {
      // Interview complete - mark session as complete
      if (sessionId) {
        try {
          await apiService.completeMockInterviewSession(sessionId)
        } catch (err) {
          console.error('Error completing session:', err)
        }
      }
      // Stop camera
      stopCamera()
      // Move to completion screen
      setShowFeedback(true)
    }
  }

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case "easy":
        return "bg-green-100 text-green-800"
      case "medium":
        return "bg-yellow-100 text-yellow-800"
      case "hard":
        return "bg-red-100 text-red-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600"
    if (score >= 60) return "text-yellow-600"
    return "text-red-600"
  }

  const calculateOverallScore = () => {
    if (allFeedbacks.length === 0) return 0
    const total = allFeedbacks.reduce((sum, f) => sum + f.score, 0)
    return Math.round(total / allFeedbacks.length)
  }

  if (!interviewStarted) {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-background relative">
          <div className="absolute inset-0 mesh-gradient pointer-events-none" />
          <div className="relative z-10">
          <div className="border-b border-border/50 glass">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
              <div className="flex items-center space-x-4">
                <Button variant="ghost" size="sm" asChild className="hover:bg-muted/50">
                  <Link href="/dashboard">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Dashboard
                  </Link>
                </Button>
                <div>
                  <h1 className="text-2xl font-black font-montserrat"><span className="gradient-text">AI Mock Interview</span></h1>
                  <p className="text-muted-foreground font-open-sans">Practice interviews with AI feedback</p>
                </div>
              </div>
            </div>
          </div>

          <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <Card className="border-border/50 bg-card/80 backdrop-blur-sm animate-slide-up">
              <CardHeader className="text-center">
                <div className="w-16 h-16 stat-icon-purple rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Brain className="w-8 h-8 text-primary" />
                </div>
                <CardTitle className="text-2xl font-black font-montserrat">Mock Interview Setup</CardTitle>
                <CardDescription className="font-open-sans">
                  Configure your interview session for personalized practice
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium font-montserrat">Your Field/Role</label>
                  <Input
                    placeholder="e.g., Software Engineer, Data Scientist, Product Manager"
                    value={customField}
                    onChange={(e) => setCustomField(e.target.value)}
                    className="font-open-sans"
                  />
                  <p className="text-xs text-muted-foreground font-open-sans">
                    Enter the specific field or role you're interviewing for
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium font-montserrat">Difficulty Level</label>
                  <Select value={selectedDifficulty} onValueChange={setSelectedDifficulty}>
                    <SelectTrigger className="font-open-sans">
                      <SelectValue placeholder="Choose difficulty level" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="easy">Easy - Entry Level</SelectItem>
                      <SelectItem value="medium">Medium - Mid Level</SelectItem>
                      <SelectItem value="hard">Hard - Senior Level</SelectItem>
                      <SelectItem value="mixed">Mixed - All Levels</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start space-x-2">
                    <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700 font-open-sans">{error}</p>
                  </div>
                )}

                <div className="space-y-2">
                  <h3 className="font-medium font-montserrat">What to Expect:</h3>
                  <ul className="text-sm text-muted-foreground space-y-1 font-open-sans">
                    <li>• 5 custom questions tailored to your field</li>
                    <li>• Real-time AI feedback with scoring (0-100)</li>
                    <li>• Detailed strengths and improvement suggestions</li>
                    <li>• Key points analysis for each answer</li>
                  </ul>
                </div>

                <div className="space-y-2 bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
                  <h3 className="font-medium font-montserrat">Interview Features:</h3>
                  <ul className="text-sm text-muted-foreground space-y-1 font-open-sans">
                    <li>• <strong>Camera:</strong> Practice with live video (optional)</li>
                    <li>• <strong>Voice-to-Text:</strong> Speak your answers naturally</li>
                    <li>• <strong>Timer:</strong> 3 minutes per question (industry standard)</li>
                    <li>• <strong>Privacy:</strong> All recordings stay on your device</li>
                  </ul>
                </div>

                <Button
                  className="w-full font-semibold bg-gradient-to-r from-primary to-chart-5 hover:opacity-90 shadow-md shadow-primary/20"
                  onClick={handleStartInterview}
                  disabled={!customField.trim() || !selectedDifficulty || !userId || isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Generating Questions...
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 mr-2" />
                      Start Mock Interview
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>
          </div>
        </div>
      </AuthGuard>
    )
  }

  if (currentQuestion >= questions.length || (showFeedback && currentQuestion === questions.length - 1)) {
    const overallScore = calculateOverallScore()
    
    return (
      <AuthGuard>
        <div className="min-h-screen bg-background relative">
          <div className="absolute inset-0 mesh-gradient pointer-events-none" />
          <div className="relative z-10">
          <div className="border-b border-border/50 glass">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
              <div className="flex items-center space-x-4">
                <Button variant="ghost" size="sm" asChild className="hover:bg-muted/50">
                  <Link href="/dashboard">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Dashboard
                  </Link>
                </Button>
                <div>
                  <h1 className="text-2xl font-black font-montserrat"><span className="gradient-text">Interview Complete!</span></h1>
                  <p className="text-muted-foreground font-open-sans">Great job completing the mock interview</p>
                </div>
              </div>
            </div>
          </div>

          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <Card className="border-border/50 bg-card/80 backdrop-blur-sm animate-slide-up">
              <CardHeader className="text-center">
                <CardTitle className="text-2xl font-black font-montserrat">Interview Summary</CardTitle>
                <CardDescription className="font-open-sans">
                  Here's how you performed in your {customField} mock interview
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-2 gap-4 text-center">
                  <div>
                    <div className={`text-3xl font-bold font-montserrat ${getScoreColor(overallScore)}`}>
                      {overallScore}%
                    </div>
                    <div className="text-sm text-muted-foreground font-open-sans">Overall Score</div>
                  </div>
                  <div>
                    <div className="text-3xl font-bold font-montserrat">{questions.length}</div>
                    <div className="text-sm text-muted-foreground font-open-sans">Questions Answered</div>
                  </div>
                </div>

                {allFeedbacks.map((fb, idx) => (
                  <Card key={idx} className="border-l-4" style={{ borderLeftColor: fb.score >= 80 ? '#22c55e' : fb.score >= 60 ? '#eab308' : '#ef4444' }}>
                    <CardHeader>
                      <div className="flex justify-between items-start">
                        <CardTitle className="text-base font-montserrat">Question {idx + 1}</CardTitle>
                        <Badge className={getScoreColor(fb.score)}>{fb.score}/100</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {fb.strengths.length > 0 && (
                        <div>
                          <h4 className="font-medium font-montserrat text-green-800 text-sm">Strengths:</h4>
                          <ul className="text-sm space-y-1 font-open-sans ml-4">
                            {fb.strengths.map((s, i) => (
                              <li key={i}>• {s}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {fb.improvements.length > 0 && (
                        <div>
                          <h4 className="font-medium font-montserrat text-orange-800 text-sm">Improvements:</h4>
                          <ul className="text-sm space-y-1 font-open-sans ml-4">
                            {fb.improvements.map((imp, i) => (
                              <li key={i}>• {imp}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}

                <div className="flex justify-center space-x-4 pt-4">
                  <Button
                    onClick={() => {
                      setInterviewStarted(false)
                      setCurrentQuestion(0)
                      setShowFeedback(false)
                      setQuestions([])
                      setAllFeedbacks([])
                      setFeedback(null)
                      setSessionId(null)
                      setUserAnswer("")
                      setTimeRemaining(180)
                      setTimerActive(false)
                      stopCamera()
                      if (recognitionRef.current && isListening) {
                        recognitionRef.current.stop()
                      }
                    }}
                  >
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Practice Again
                  </Button>
                  <Button variant="outline" asChild className="border-border/50">
                    <Link href="/dashboard">Back to Dashboard</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
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
        {/* Header */}
        <div className="border-b border-border/50 glass">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <Button variant="ghost" size="sm" asChild className="hover:bg-muted/50">
                  <Link href="/dashboard">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Exit
                  </Link>
                </Button>
                <div>
                  <h1 className="text-2xl font-black font-montserrat">{customField} Interview</h1>
                  <p className="text-muted-foreground font-open-sans">
                    Question {currentQuestion + 1} of {questions.length}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <div className="flex items-center space-x-2 bg-background px-3 py-2 rounded-lg border">
                  <Clock className={`w-4 h-4 ${getTimerColor()}`} />
                  <span className={`font-mono font-bold ${getTimerColor()}`}>
                    {formatTime(timeRemaining)}
                  </span>
                </div>
                <Badge>{currentQ?.category}</Badge>
                <Badge className={getDifficultyColor(currentQ?.difficulty || 'medium')}>{currentQ?.difficulty}</Badge>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Video/Question Area */}
            <div className="space-y-6">
              {/* Camera Video Feed */}
              <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
                <CardContent className="p-0">
                  <div className="aspect-video bg-gray-900 rounded-xl flex items-center justify-center relative overflow-hidden">
                    {/* Video element - always in DOM but conditionally visible */}
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className={`w-full h-full object-cover min-h-[300px] ${isCameraActive ? 'block' : 'hidden'}`}
                      style={{ display: isCameraActive ? 'block' : 'none' }}
                      onLoadedMetadata={(e) => {
                        const video = e.target as HTMLVideoElement
                        console.log('Video metadata loaded')
                        video.play().catch(err => console.error('Error playing video on metadata load:', err))
                      }}
                      onCanPlay={() => {
                        console.log('Video can play')
                      }}
                      onPlay={() => {
                        console.log('Video started playing')
                      }}
                      onError={(e) => {
                        console.error('Video error:', e)
                      }}
                    />
                    
                    {/* Camera Off message */}
                    {!isCameraActive && (
                      <div className="absolute inset-0 flex items-center justify-center text-white text-center bg-gray-900">
                        <div>
                          <VideoOff className="w-12 h-12 mx-auto mb-2" />
                          <p className="font-open-sans">Camera Off</p>
                          <p className="text-sm text-gray-400 mt-1 font-open-sans">Click below to enable</p>
                        </div>
                      </div>
                    )}

                    {/* Timer Overlay */}
                    <div className="absolute top-4 right-4 bg-black/70 backdrop-blur-sm rounded-lg px-3 py-2 flex items-center space-x-2">
                      <Clock className={`w-4 h-4 ${getTimerColor()}`} />
                      <span className={`font-mono font-bold ${getTimerColor()}`}>
                        {formatTime(timeRemaining)}
                      </span>
                    </div>

                    {/* Controls */}
                    <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex space-x-2">
                      <Button
                        size="sm"
                        variant={isCameraActive ? "default" : "secondary"}
                        onClick={toggleCamera}
                        title={isCameraActive ? "Turn off camera" : "Turn on camera"}
                      >
                        {isCameraActive ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
                      </Button>
                      <Button
                        size="sm"
                        variant={timerActive ? "default" : "secondary"}
                        onClick={() => setTimerActive(!timerActive)}
                        title={timerActive ? "Pause timer" : "Resume timer"}
                      >
                        {timerActive ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Question */}
              <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="font-montserrat">Interview Question</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-lg font-open-sans leading-relaxed">{currentQ?.question}</p>
                </CardContent>
              </Card>
            </div>

            {/* Answer/Tips Area */}
            <div className="space-y-6">
              {/* Answer Input */}
              <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="font-montserrat">Your Answer</CardTitle>
                  <CardDescription className="font-open-sans">
                    Type your response or use voice input (minimum 10 characters)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Textarea
                    placeholder="Type your answer here or click the microphone to speak..."
                    value={userAnswer}
                    onChange={(e) => setUserAnswer(e.target.value)}
                    className="min-h-32 font-open-sans"
                    disabled={showFeedback}
                  />
                  {error && (
                    <div className="mt-2 bg-red-50 border border-red-200 rounded p-2 flex items-start space-x-2">
                      <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-red-700 font-open-sans">{error}</p>
                    </div>
                  )}
                  <div className="mt-4 flex justify-between items-center">
                    <div className="flex space-x-2">
                      <Button 
                        variant={isListening ? "destructive" : "outline"} 
                        size="sm"
                        onClick={toggleSpeechRecognition}
                        disabled={showFeedback}
                        title={isListening ? "Stop voice input" : "Start voice input"}
                      >
                        {isListening ? (
                          <>
                            <MicOff className="w-4 h-4 mr-2" />
                            Listening...
                          </>
                        ) : (
                          <>
                            <Mic className="w-4 h-4 mr-2" />
                            Voice Input
                          </>
                        )}
                      </Button>
                      {isListening && (
                        <div className="flex items-center space-x-1">
                          <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                          <span className="text-xs text-red-600 font-open-sans">Recording</span>
                        </div>
                      )}
                    </div>
                    {!showFeedback && (
                      <Button 
                        onClick={handleSubmitAnswer} 
                        disabled={!userAnswer.trim() || userAnswer.trim().length < 10 || isEvaluating}
                      >
                        {isEvaluating ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Evaluating...
                          </>
                        ) : (
                          'Submit Answer'
                        )}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Tips */}
              <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="font-montserrat">Tips for This Question</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {currentQ?.tips?.map((tip, index) => (
                      <li key={index} className="flex items-start space-x-2">
                        <div className="w-1.5 h-1.5 bg-accent rounded-full mt-2 flex-shrink-0"></div>
                        <span className="text-sm font-open-sans">{tip}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              {/* AI Feedback */}
              {showFeedback && feedback && (
                <Card className={`border-border/50 backdrop-blur-sm ${feedback.score >= 80 ? "bg-green-500/10" : feedback.score >= 60 ? "bg-yellow-500/10" : "bg-red-500/10"}`}>
                  <CardHeader>
                    <div className="flex justify-between items-center">
                      <CardTitle className="font-montserrat">AI Feedback</CardTitle>
                      <Badge className={getScoreColor(feedback.score)}>{feedback.score}/100</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {feedback.strengths.length > 0 && (
                        <div>
                          <h4 className="font-medium font-montserrat text-green-800">Strengths:</h4>
                          <ul className="text-sm space-y-1 font-open-sans ml-4">
                            {feedback.strengths.map((s, i) => (
                              <li key={i}>• {s}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {feedback.improvements.length > 0 && (
                        <div>
                          <h4 className="font-medium font-montserrat text-orange-800">Suggestions for Improvement:</h4>
                          <ul className="text-sm space-y-1 font-open-sans ml-4">
                            {feedback.improvements.map((imp, i) => (
                              <li key={i}>• {imp}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {feedback.keyPointsCovered.length > 0 && (
                        <div>
                          <h4 className="font-medium font-montserrat text-blue-800">Key Points Covered:</h4>
                          <ul className="text-sm space-y-1 font-open-sans ml-4">
                            {feedback.keyPointsCovered.map((kp, i) => (
                              <li key={i}>✓ {kp}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {feedback.keyPointsMissed.length > 0 && (
                        <div>
                          <h4 className="font-medium font-montserrat text-gray-800">Key Points Missed:</h4>
                          <ul className="text-sm space-y-1 font-open-sans ml-4">
                            {feedback.keyPointsMissed.map((kp, i) => (
                              <li key={i}>✗ {kp}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <Button onClick={handleNextQuestion} className="w-full mt-4 font-semibold bg-gradient-to-r from-primary to-chart-5 hover:opacity-90 shadow-md shadow-primary/20">
                        {currentQuestion === questions.length - 1 ? "Finish Interview" : "Next Question"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
        </div>
      </div>
    </AuthGuard>
  )
}
