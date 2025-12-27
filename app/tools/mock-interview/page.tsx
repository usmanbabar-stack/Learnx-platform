"use client"
import { Navigation } from "@/components/navigation"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Mic, MicOff, Video, VideoOff, ArrowLeft, Brain, Play, Pause, RotateCcw } from "lucide-react"
import Link from "next/link"
import { AuthGuard } from "@/components/auth-guard"

interface InterviewQuestion {
  id: string
  question: string
  category: string
  difficulty: "easy" | "medium" | "hard"
  tips: string[]
}

const mockQuestions: InterviewQuestion[] = [
  {
    id: "1",
    question: "Tell me about yourself and your background in machine learning.",
    category: "Introduction",
    difficulty: "easy",
    tips: [
      "Keep it concise (2-3 minutes)",
      "Focus on relevant experience",
      "Mention key projects or achievements",
      "Connect your background to the role",
    ],
  },
  {
    id: "2",
    question: "Explain the difference between supervised and unsupervised learning with examples.",
    category: "Technical",
    difficulty: "medium",
    tips: [
      "Define both concepts clearly",
      "Provide concrete examples",
      "Mention use cases for each",
      "Discuss when to use which approach",
    ],
  },
  {
    id: "3",
    question: "How would you handle overfitting in a machine learning model?",
    category: "Problem Solving",
    difficulty: "hard",
    tips: [
      "Explain what overfitting is",
      "List multiple prevention techniques",
      "Discuss regularization methods",
      "Mention cross-validation",
    ],
  },
]

export default function MockInterviewPage() {
  const [interviewStarted, setInterviewStarted] = useState(false)
  const [currentQuestion, setCurrentQuestion] = useState(0)
  const [selectedRole, setSelectedRole] = useState("")
  const [selectedDifficulty, setSelectedDifficulty] = useState("")
  const [isRecording, setIsRecording] = useState(false)
  const [videoEnabled, setVideoEnabled] = useState(true)
  const [audioEnabled, setAudioEnabled] = useState(true)
  const [userAnswer, setUserAnswer] = useState("")
  const [showFeedback, setShowFeedback] = useState(false)

  const currentQ = mockQuestions[currentQuestion]

  const handleStartInterview = () => {
    if (selectedRole && selectedDifficulty) {
      setInterviewStarted(true)
    }
  }

  const handleNextQuestion = () => {
    if (currentQuestion < mockQuestions.length - 1) {
      setCurrentQuestion(currentQuestion + 1)
      setUserAnswer("")
      setShowFeedback(false)
    } else {
      // Interview complete
      setShowFeedback(true)
    }
  }

  const handleSubmitAnswer = () => {
    setShowFeedback(true)
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

  if (!interviewStarted) {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-background">
          <div className="border-b border-border bg-card/50 backdrop-blur-sm">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
              <div className="flex items-center space-x-4">
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/dashboard">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Dashboard
                  </Link>
                </Button>
                <div>
                  <h1 className="text-2xl font-black font-montserrat">AI Mock Interview</h1>
                  <p className="text-muted-foreground font-open-sans">Practice interviews with AI feedback</p>
                </div>
              </div>
            </div>
          </div>

          <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <Card>
              <CardHeader className="text-center">
                <div className="w-16 h-16 bg-accent/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Brain className="w-8 h-8 text-accent" />
                </div>
                <CardTitle className="text-2xl font-black font-montserrat">Mock Interview Setup</CardTitle>
                <CardDescription className="font-open-sans">
                  Configure your interview session for personalized practice
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium font-montserrat">Interview Role</label>
                  <Select value={selectedRole} onValueChange={setSelectedRole}>
                    <SelectTrigger className="font-open-sans">
                      <SelectValue placeholder="Select the role you're interviewing for" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ml-engineer">Machine Learning Engineer</SelectItem>
                      <SelectItem value="data-scientist">Data Scientist</SelectItem>
                      <SelectItem value="ai-researcher">AI Researcher</SelectItem>
                      <SelectItem value="software-engineer">Software Engineer</SelectItem>
                      <SelectItem value="product-manager">Product Manager</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium font-montserrat">Difficulty Level</label>
                  <Select value={selectedDifficulty} onValueChange={setSelectedDifficulty}>
                    <SelectTrigger className="font-open-sans">
                      <SelectValue placeholder="Choose difficulty level" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="entry">Entry Level</SelectItem>
                      <SelectItem value="mid">Mid Level</SelectItem>
                      <SelectItem value="senior">Senior Level</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <h3 className="font-medium font-montserrat">What to Expect:</h3>
                  <ul className="text-sm text-muted-foreground space-y-1 font-open-sans">
                    <li>• 3-5 interview questions tailored to your role</li>
                    <li>• Real-time AI feedback on your answers</li>
                    <li>• Tips and suggestions for improvement</li>
                    <li>• Practice with video and audio recording</li>
                  </ul>
                </div>

                <Button
                  className="w-full"
                  onClick={handleStartInterview}
                  disabled={!selectedRole || !selectedDifficulty}
                >
                  <Play className="w-4 h-4 mr-2" />
                  Start Mock Interview
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </AuthGuard>
    )
  }

  if (currentQuestion >= mockQuestions.length) {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-background">
          <div className="border-b border-border bg-card/50 backdrop-blur-sm">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
              <div className="flex items-center space-x-4">
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/dashboard">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Dashboard
                  </Link>
                </Button>
                <div>
                  <h1 className="text-2xl font-black font-montserrat">Interview Complete!</h1>
                  <p className="text-muted-foreground font-open-sans">Great job completing the mock interview</p>
                </div>
              </div>
            </div>
          </div>

          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <Card>
              <CardHeader className="text-center">
                <CardTitle className="text-2xl font-black font-montserrat">Interview Summary</CardTitle>
                <CardDescription className="font-open-sans">
                  Here's how you performed in your mock interview
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-2xl font-bold font-montserrat">85%</div>
                    <div className="text-sm text-muted-foreground font-open-sans">Overall Score</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold font-montserrat">{mockQuestions.length}</div>
                    <div className="text-sm text-muted-foreground font-open-sans">Questions Answered</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold font-montserrat">12m</div>
                    <div className="text-sm text-muted-foreground font-open-sans">Total Time</div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="font-medium font-montserrat">Key Strengths:</h3>
                  <ul className="text-sm space-y-1 font-open-sans">
                    <li>• Clear and concise explanations</li>
                    <li>• Good technical knowledge</li>
                    <li>• Confident delivery</li>
                  </ul>
                </div>

                <div className="space-y-4">
                  <h3 className="font-medium font-montserrat">Areas for Improvement:</h3>
                  <ul className="text-sm space-y-1 font-open-sans">
                    <li>• Provide more specific examples</li>
                    <li>• Structure answers using frameworks</li>
                    <li>• Practice explaining complex concepts simply</li>
                  </ul>
                </div>

                <div className="flex justify-center space-x-4">
                  <Button
                    onClick={() => {
                      setInterviewStarted(false)
                      setCurrentQuestion(0)
                      setShowFeedback(false)
                    }}
                  >
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Practice Again
                  </Button>
                  <Button variant="outline" asChild>
                    <Link href="/dashboard">Back to Dashboard</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </AuthGuard>
    )
  }

  return (
    <AuthGuard>
      <div className="min-h-screen bg-background">
        {/* Header */}
        <div className="border-b border-border bg-card/50 backdrop-blur-sm">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/dashboard">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Dashboard
                  </Link>
                </Button>
                <div>
                  <h1 className="text-2xl font-black font-montserrat">Mock Interview</h1>
                  <p className="text-muted-foreground font-open-sans">
                    Question {currentQuestion + 1} of {mockQuestions.length}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Badge>{currentQ.category}</Badge>
                <Badge className={getDifficultyColor(currentQ.difficulty)}>{currentQ.difficulty}</Badge>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Video/Question Area */}
            <div className="space-y-6">
              {/* Mock Video Area */}
              <Card>
                <CardContent className="p-0">
                  <div className="aspect-video bg-gray-900 rounded-lg flex items-center justify-center relative">
                    {videoEnabled ? (
                      <div className="text-white text-center">
                        <Video className="w-12 h-12 mx-auto mb-2" />
                        <p className="font-open-sans">Camera Active</p>
                      </div>
                    ) : (
                      <div className="text-gray-400 text-center">
                        <VideoOff className="w-12 h-12 mx-auto mb-2" />
                        <p className="font-open-sans">Camera Off</p>
                      </div>
                    )}

                    {/* Controls */}
                    <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex space-x-2">
                      <Button
                        size="sm"
                        variant={audioEnabled ? "default" : "secondary"}
                        onClick={() => setAudioEnabled(!audioEnabled)}
                      >
                        {audioEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                      </Button>
                      <Button
                        size="sm"
                        variant={videoEnabled ? "default" : "secondary"}
                        onClick={() => setVideoEnabled(!videoEnabled)}
                      >
                        {videoEnabled ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
                      </Button>
                      <Button
                        size="sm"
                        variant={isRecording ? "destructive" : "default"}
                        onClick={() => setIsRecording(!isRecording)}
                      >
                        {isRecording ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Question */}
              <Card>
                <CardHeader>
                  <CardTitle className="font-montserrat">Interview Question</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-lg font-open-sans leading-relaxed">{currentQ.question}</p>
                </CardContent>
              </Card>
            </div>

            {/* Answer/Tips Area */}
            <div className="space-y-6">
              {/* Answer Input */}
              <Card>
                <CardHeader>
                  <CardTitle className="font-montserrat">Your Answer</CardTitle>
                  <CardDescription className="font-open-sans">
                    Type your response or use voice recording
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Textarea
                    placeholder="Type your answer here..."
                    value={userAnswer}
                    onChange={(e) => setUserAnswer(e.target.value)}
                    className="min-h-32 font-open-sans"
                  />
                  <div className="mt-4 flex justify-between">
                    <Button variant="outline" size="sm">
                      <Mic className="w-4 h-4 mr-2" />
                      Voice Input
                    </Button>
                    <Button onClick={handleSubmitAnswer} disabled={!userAnswer.trim()}>
                      Submit Answer
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Tips */}
              <Card>
                <CardHeader>
                  <CardTitle className="font-montserrat">Tips for This Question</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {currentQ.tips.map((tip, index) => (
                      <li key={index} className="flex items-start space-x-2">
                        <div className="w-1.5 h-1.5 bg-accent rounded-full mt-2 flex-shrink-0"></div>
                        <span className="text-sm font-open-sans">{tip}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              {/* AI Feedback */}
              {showFeedback && (
                <Card className="border-green-200 bg-green-50">
                  <CardHeader>
                    <CardTitle className="font-montserrat text-green-800">AI Feedback</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div>
                        <h4 className="font-medium font-montserrat text-green-800">Strengths:</h4>
                        <p className="text-sm text-green-700 font-open-sans">
                          Good structure and clear explanation of key concepts.
                        </p>
                      </div>
                      <div>
                        <h4 className="font-medium font-montserrat text-green-800">Suggestions:</h4>
                        <p className="text-sm text-green-700 font-open-sans">
                          Consider adding a specific example to illustrate your point.
                        </p>
                      </div>
                      <Button onClick={handleNextQuestion} className="w-full">
                        {currentQuestion === mockQuestions.length - 1 ? "Finish Interview" : "Next Question"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      </div>
    </AuthGuard>
  )
}
