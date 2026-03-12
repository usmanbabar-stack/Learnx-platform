"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { CheckCircle, X, ArrowLeft, Brain, Clock, Target, Loader2 } from "lucide-react"
import Link from "next/link"
import { AuthGuard } from "@/components/auth-guard"
import { Navigation } from "@/components/navigation"
import { apiService } from "@/lib/api"

interface QuizQuestion {
  id: string
  question: string
  options: string[]
  correctAnswer: number
  explanation: string
  difficulty: "easy" | "medium" | "hard"
  category?: string
  timestamp?: string
}

const mockQuiz_UNUSED: QuizQuestion[] = [
  // This is legacy data, not used anymore
  {
    id: "1",
    question: "What is the primary goal of machine learning?",
    options: [
      "To replace human intelligence completely",
      "To enable computers to learn and make decisions from data",
      "To create robots that can think like humans",
      "To automate all business processes",
    ],
    correctAnswer: 1,
    explanation:
      "Machine learning aims to enable computers to learn patterns from data and make predictions or decisions without being explicitly programmed for every scenario.",
    difficulty: "easy",
  },
  {
    id: "2",
    question: "Which of the following is NOT a type of machine learning?",
    options: ["Supervised learning", "Unsupervised learning", "Reinforcement learning", "Deterministic learning"],
    correctAnswer: 3,
    explanation:
      "Deterministic learning is not a recognized type of machine learning. The three main types are supervised, unsupervised, and reinforcement learning.",
    difficulty: "medium",
  },
  {
    id: "3",
    question: "What is overfitting in machine learning?",
    options: [
      "When a model performs too well on training data but poorly on new data",
      "When a model is too simple to capture patterns",
      "When there's too much training data",
      "When the model training takes too long",
    ],
    correctAnswer: 0,
    explanation:
      "Overfitting occurs when a model learns the training data too well, including noise and random fluctuations, resulting in poor generalization to new data.",
    difficulty: "hard",
  },
]

export default function QuizPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const videoId = searchParams.get("videoId")
  const videoTitle = searchParams.get("title") || "Video Quiz"

  const [quiz, setQuiz] = useState<QuizQuestion[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentQuestion, setCurrentQuestion] = useState(0)
  const [selectedAnswers, setSelectedAnswers] = useState<number[]>([])
  const [showResults, setShowResults] = useState(false)
  const [quizStarted, setQuizStarted] = useState(false)
  const [timeLeft, setTimeLeft] = useState(300) // 5 minutes

  const isLoadingRef = useRef(false)

  // Fetch quiz from API
  const fetchQuiz = useCallback(async () => {
    if (!videoId || isLoadingRef.current) return

    isLoadingRef.current = true
    setLoading(true)
    setError(null)

    try {
      const response = await apiService.getVideoQuiz(videoId, 10)
      if (response.success && response.data?.questions) {
        setQuiz(response.data.questions)
      } else {
        setError(response.error || "Failed to generate quiz")
      }
    } catch (err) {
      console.error("Error fetching quiz:", err)
      setError("Failed to load quiz. Please try again.")
    } finally {
      setLoading(false)
      isLoadingRef.current = false
    }
  }, [videoId])

  useEffect(() => {
    if (videoId) {
      fetchQuiz()
    }
  }, [videoId, fetchQuiz])

  const progress = quiz.length > 0 ? ((currentQuestion + 1) / quiz.length) * 100 : 0
  const score = selectedAnswers.reduce((acc, answer, index) => {
    return acc + (answer === quiz[index]?.correctAnswer ? 1 : 0)
  }, 0)

  const handleAnswerSelect = (answerIndex: number) => {
    const newAnswers = [...selectedAnswers]
    newAnswers[currentQuestion] = answerIndex
    setSelectedAnswers(newAnswers)
  }

  const handleNext = () => {
    if (currentQuestion < quiz.length - 1) {
      setCurrentQuestion(currentQuestion + 1)
    } else {
      setShowResults(true)
    }
  }

  const handlePrevious = () => {
    if (currentQuestion > 0) {
      setCurrentQuestion(currentQuestion - 1)
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
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

  // Loading state
  if (loading) {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-background relative">
          <div className="absolute inset-0 mesh-gradient pointer-events-none" />
          <div className="relative z-10">
          <Navigation />
          <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12 flex flex-col items-center justify-center">
            <Loader2 className="w-12 h-12 animate-spin text-primary mb-4" />
            <h2 className="text-xl font-bold font-montserrat mb-2">Generating Quiz</h2>
            <p className="text-muted-foreground font-open-sans">Please wait while we create your personalized quiz...</p>
          </div>
          </div>
        </div>
      </AuthGuard>
    )
  }

  // Error state
  if (error) {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-background relative">
          <div className="absolute inset-0 mesh-gradient pointer-events-none" />
          <div className="relative z-10">
          <Navigation />
          <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <Card className="border-border/50 bg-card/80 backdrop-blur-sm animate-scale-in">
              <CardHeader className="text-center">
                <div className="w-16 h-16 bg-destructive/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <X className="w-8 h-8 text-destructive" />
                </div>
                <CardTitle className="text-2xl font-black font-montserrat">Quiz Error</CardTitle>
                <CardDescription className="font-open-sans">{error}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button className="w-full font-semibold bg-gradient-to-r from-primary to-chart-5 hover:opacity-90 shadow-md shadow-primary/20" onClick={fetchQuiz}>
                  Try Again
                </Button>
                <Button className="w-full" variant="outline" asChild>
                  <Link href="/dashboard">Back to Dashboard</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
          </div>
        </div>
      </AuthGuard>
    )
  }

  // No quiz available
  if (!loading && quiz.length === 0) {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-background relative">
          <div className="absolute inset-0 mesh-gradient pointer-events-none" />
          <div className="relative z-10">
          <Navigation />
          <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <Card className="border-border/50 bg-card/80 backdrop-blur-sm animate-scale-in">
              <CardHeader className="text-center">
                <div className="w-16 h-16 stat-icon-purple rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Brain className="w-8 h-8 text-primary" />
                </div>
                <CardTitle className="text-2xl font-black font-montserrat">No Quiz Available</CardTitle>
                <CardDescription className="font-open-sans">
                  Unable to generate quiz. Please try again later.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button className="w-full" variant="outline" asChild>
                  <Link href="/dashboard">Back to Dashboard</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
          </div>
        </div>
      </AuthGuard>
    )
  }

  if (!quizStarted) {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-background relative">
          <div className="absolute inset-0 mesh-gradient pointer-events-none" />
          <div className="relative z-10">
          <Navigation />

          <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <Card className="border-border/50 bg-card/80 backdrop-blur-sm animate-slide-up">
              <CardHeader className="text-center">
                <div className="w-16 h-16 stat-icon-purple rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Brain className="w-8 h-8 text-primary" />
                </div>
                <CardTitle className="text-2xl font-black font-montserrat">{videoTitle}</CardTitle>
                <CardDescription className="font-open-sans">
                  Test your understanding of the video content
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-2xl font-bold font-montserrat">{quiz.length}</div>
                    <div className="text-sm text-muted-foreground font-open-sans">Questions</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold font-montserrat">5</div>
                    <div className="text-sm text-muted-foreground font-open-sans">Minutes</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold font-montserrat">Mixed</div>
                    <div className="text-sm text-muted-foreground font-open-sans">Difficulty</div>
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="font-medium font-montserrat">Quiz Instructions:</h3>
                  <ul className="text-sm text-muted-foreground space-y-1 font-open-sans">
                    <li>• Answer all questions to the best of your ability</li>
                    <li>• You can navigate between questions</li>
                    <li>• Time limit: 5 minutes</li>
                    <li>• Results will be shown at the end</li>
                  </ul>
                </div>

                <Button className="w-full font-semibold bg-gradient-to-r from-primary to-chart-5 hover:opacity-90 shadow-md shadow-primary/20" onClick={() => setQuizStarted(true)}>
                  <Target className="w-4 h-4 mr-2" />
                  Start Quiz
                </Button>
              </CardContent>
            </Card>
          </div>
          </div>
        </div>
      </AuthGuard>
    )
  }

  if (showResults) {
    const percentage = Math.round((score / quiz.length) * 100)
    return (
      <AuthGuard>
        <div className="min-h-screen bg-background relative">
          <div className="absolute inset-0 mesh-gradient pointer-events-none" />
          <div className="relative z-10">
          <Navigation />

          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <Card className="mb-8 border-border/50 bg-card/80 backdrop-blur-sm animate-scale-in">
              <CardHeader className="text-center">
                <div
                  className={`w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-4 ${
                    percentage >= 80 ? "bg-green-500/10" : percentage >= 60 ? "bg-yellow-500/10" : "bg-red-500/10"
                  }`}
                >
                  <span
                    className={`text-2xl font-bold ${
                      percentage >= 80 ? "text-green-600" : percentage >= 60 ? "text-yellow-600" : "text-red-600"
                    }`}
                  >
                    {percentage}%
                  </span>
                </div>
                <CardTitle className="text-2xl font-black font-montserrat">
                  {percentage >= 80 ? "Excellent!" : percentage >= 60 ? "Good Job!" : "Keep Learning!"}
                </CardTitle>
                <CardDescription className="font-open-sans">
                  You scored {score} out of {quiz.length} questions correctly
                </CardDescription>
              </CardHeader>
            </Card>

            {/* Question Review */}
            <div className="space-y-6">
              <h2 className="text-xl font-bold font-montserrat">Question Review</h2>
              {quiz.map((question, index) => {
                const userAnswer = selectedAnswers[index]
                const isCorrect = userAnswer === question.correctAnswer

                return (
                  <Card
                    key={question.id}
                    className={`border-l-4 border-border/50 bg-card/80 backdrop-blur-sm ${isCorrect ? "border-l-green-500" : "border-l-red-500"}`}
                  >
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg font-montserrat">Question {index + 1}</CardTitle>
                        <div className="flex items-center space-x-2">
                          <Badge className={getDifficultyColor(question.difficulty)}>{question.difficulty}</Badge>
                          {isCorrect ? (
                            <CheckCircle className="w-5 h-5 text-green-500" />
                          ) : (
                            <X className="w-5 h-5 text-red-500" />
                          )}
                        </div>
                      </div>
                      <CardDescription className="font-open-sans">{question.question}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        {question.options.map((option, optionIndex) => (
                          <div
                            key={optionIndex}
                            className={`p-3 rounded-xl border ${
                              optionIndex === question.correctAnswer
                                ? "bg-green-500/10 border-green-500/30"
                                : optionIndex === userAnswer && !isCorrect
                                  ? "bg-red-500/10 border-red-500/30"
                                  : "bg-muted/30 border-border/50"
                            }`}
                          >
                            <div className="flex items-center space-x-2">
                              {optionIndex === question.correctAnswer && (
                                <CheckCircle className="w-4 h-4 text-green-500" />
                              )}
                              {optionIndex === userAnswer && !isCorrect && <X className="w-4 h-4 text-red-500" />}
                              <span className="font-open-sans">{option}</span>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
                        <h4 className="font-medium font-montserrat mb-2">Explanation:</h4>
                        <p className="text-sm font-open-sans">{question.explanation}</p>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>

            <div className="mt-8 flex justify-center space-x-4">
              <Button
                className="font-semibold bg-gradient-to-r from-primary to-chart-5 hover:opacity-90 shadow-md shadow-primary/20"
                onClick={() => {
                  setCurrentQuestion(0)
                  setSelectedAnswers([])
                  setShowResults(false)
                  setQuizStarted(false)
                }}
              >
                Retake Quiz
              </Button>
              <Button variant="outline" asChild>
                <Link href="/dashboard">Back to Dashboard</Link>
              </Button>
            </div>
          </div>
          </div>
        </div>
      </AuthGuard>
    )
  }

  const currentQ = quiz[currentQuestion]

  return (
    <AuthGuard>
      <div className="min-h-screen bg-background relative">
        <div className="absolute inset-0 mesh-gradient pointer-events-none" />
        <div className="relative z-10">
        <Navigation />

        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Progress */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-4">
                <span className="text-sm font-medium font-open-sans">
                  Question {currentQuestion + 1} of {quiz.length}
                </span>
                <Badge className={getDifficultyColor(currentQ.difficulty)}>{currentQ.difficulty}</Badge>
              </div>
              <div className="flex items-center space-x-2 text-sm font-open-sans">
                <Clock className="w-4 h-4" />
                <span>{formatTime(timeLeft)}</span>
              </div>
            </div>
            <Progress value={progress} className="h-2" />
          </div>

          {/* Question */}
          <Card className="mb-8 border-border/50 bg-card/80 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-xl font-montserrat">{currentQ.question}</CardTitle>
            </CardHeader>
            <CardContent>
              <RadioGroup
                value={selectedAnswers[currentQuestion]?.toString()}
                onValueChange={(value) => handleAnswerSelect(Number.parseInt(value))}
              >
                {currentQ.options.map((option, index) => (
                  <div
                    key={index}
                    className="flex items-center space-x-2 p-3 rounded-xl hover:bg-muted/30 transition-colors"
                  >
                    <RadioGroupItem value={index.toString()} id={`option-${index}`} />
                    <Label htmlFor={`option-${index}`} className="flex-1 cursor-pointer font-open-sans">
                      {option}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </CardContent>
          </Card>

          {/* Navigation */}
          <div className="flex justify-between">
            <Button variant="outline" onClick={handlePrevious} disabled={currentQuestion === 0} className="border-border/50">
              Previous
            </Button>
            <Button onClick={handleNext} disabled={selectedAnswers[currentQuestion] === undefined} className="font-semibold bg-gradient-to-r from-primary to-chart-5 hover:opacity-90 shadow-md shadow-primary/20">
              {currentQuestion === quiz.length - 1 ? "Finish Quiz" : "Next"}
            </Button>
          </div>
        </div>
        </div>
      </div>
    </AuthGuard>
  )
}