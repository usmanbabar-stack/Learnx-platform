"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Brain, Sparkles, Clock, Target, CheckCircle, XCircle, RotateCcw, Download, Share } from "lucide-react"
import { Navigation } from "@/components/navigation"
import { AuthGuard } from "@/components/auth-guard"

interface Question {
  id: string
  question: string
  options: string[]
  correctAnswer: number
  explanation: string
  difficulty: "easy" | "medium" | "hard"
}

const dummyQuestions: Question[] = [
  {
    id: "1",
    question: "What is the primary purpose of React hooks?",
    options: [
      "To replace class components entirely",
      "To allow state and lifecycle features in functional components",
      "To improve performance of React applications",
      "To handle routing in React applications",
    ],
    correctAnswer: 1,
    explanation:
      "React hooks allow you to use state and other React features in functional components, making them more powerful and eliminating the need for class components in many cases.",
    difficulty: "medium",
  },
  {
    id: "2",
    question: "Which of the following is NOT a valid React hook?",
    options: ["useState", "useEffect", "useComponent", "useContext"],
    correctAnswer: 2,
    explanation:
      "useComponent is not a valid React hook. The other options (useState, useEffect, useContext) are all built-in React hooks.",
    difficulty: "easy",
  },
  {
    id: "3",
    question: "What does the dependency array in useEffect control?",
    options: [
      "The order of effect execution",
      "When the effect should re-run",
      "The cleanup function behavior",
      "The component render cycle",
    ],
    correctAnswer: 1,
    explanation:
      "The dependency array in useEffect determines when the effect should re-run. The effect only runs again if one of the dependencies has changed since the last render.",
    difficulty: "hard",
  },
]

export default function QuizGeneratorPage() {
  const [step, setStep] = useState<"setup" | "generating" | "quiz" | "results">("setup")
  const [topic, setTopic] = useState("")
  const [difficulty, setDifficulty] = useState("")
  const [questionCount, setQuestionCount] = useState("")
  const [content, setContent] = useState("")
  const [currentQuestion, setCurrentQuestion] = useState(0)
  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [showResults, setShowResults] = useState(false)
  const [generationProgress, setGenerationProgress] = useState(0)

  const handleGenerate = async () => {
    setStep("generating")
    setGenerationProgress(0)

    // Simulate AI generation process
    const intervals = [20, 40, 60, 80, 100]
    for (let i = 0; i < intervals.length; i++) {
      await new Promise((resolve) => setTimeout(resolve, 800))
      setGenerationProgress(intervals[i])
    }

    setStep("quiz")
  }

  const handleAnswerSelect = (questionId: string, answerIndex: number) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: answerIndex,
    }))
  }

  const handleNextQuestion = () => {
    if (currentQuestion < dummyQuestions.length - 1) {
      setCurrentQuestion(currentQuestion + 1)
    } else {
      setStep("results")
    }
  }

  const handlePreviousQuestion = () => {
    if (currentQuestion > 0) {
      setCurrentQuestion(currentQuestion - 1)
    }
  }

  const calculateScore = () => {
    let correct = 0
    dummyQuestions.forEach((question) => {
      if (answers[question.id] === question.correctAnswer) {
        correct++
      }
    })
    return { correct, total: dummyQuestions.length, percentage: Math.round((correct / dummyQuestions.length) * 100) }
  }

  const resetQuiz = () => {
    setStep("setup")
    setCurrentQuestion(0)
    setAnswers({})
    setTopic("")
    setDifficulty("")
    setQuestionCount("")
    setContent("")
  }

  const getDifficultyColor = (diff: string) => {
    switch (diff) {
      case "easy":
        return "bg-green-500"
      case "medium":
        return "bg-yellow-500"
      case "hard":
        return "bg-red-500"
      default:
        return "bg-gray-500"
    }
  }

  return (
    <AuthGuard>
      <div className="min-h-screen bg-background relative">
        <div className="absolute inset-0 mesh-gradient pointer-events-none" />
        <div className="relative z-10">
        <Navigation />

        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {step === "setup" && (
            <div className="space-y-6 animate-slide-up">
              <div className="text-center">
                <div className="w-16 h-16 stat-icon-purple rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Brain className="w-8 h-8 text-primary" />
                </div>
                <h1 className="text-3xl font-black font-montserrat mb-2"><span className="gradient-text">AI Quiz Generator</span></h1>
                <p className="text-muted-foreground font-open-sans">
                  Generate personalized quizzes from any topic or content using AI
                </p>
              </div>

              <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="font-montserrat">Quiz Configuration</CardTitle>
                  <CardDescription className="font-open-sans">
                    Set up your quiz parameters and let AI generate questions for you
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="topic" className="font-open-sans">
                        Topic
                      </Label>
                      <Input
                        id="topic"
                        placeholder="e.g., React Hooks, Machine Learning, History"
                        value={topic}
                        onChange={(e) => setTopic(e.target.value)}
                        className="font-open-sans"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="font-open-sans">Difficulty Level</Label>
                      <Select value={difficulty} onValueChange={setDifficulty}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select difficulty" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="easy">Easy</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="hard">Hard</SelectItem>
                          <SelectItem value="mixed">Mixed</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="font-open-sans">Number of Questions</Label>
                    <Select value={questionCount} onValueChange={setQuestionCount}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select question count" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="5">5 Questions</SelectItem>
                        <SelectItem value="10">10 Questions</SelectItem>
                        <SelectItem value="15">15 Questions</SelectItem>
                        <SelectItem value="20">20 Questions</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="content" className="font-open-sans">
                      Additional Content (Optional)
                    </Label>
                    <Textarea
                      id="content"
                      placeholder="Paste any specific content, notes, or materials you want the quiz to be based on..."
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      rows={4}
                      className="font-open-sans"
                    />
                  </div>

                  <Button
                    onClick={handleGenerate}
                    disabled={!topic || !difficulty || !questionCount}
                    className="w-full font-semibold bg-gradient-to-r from-primary to-chart-5 hover:opacity-90 shadow-md shadow-primary/20"
                    size="lg"
                  >
                    <Sparkles className="w-5 h-5 mr-2" />
                    Generate Quiz with AI
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}

          {step === "generating" && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="w-16 h-16 stat-icon-purple rounded-2xl flex items-center justify-center mx-auto mb-4 animate-pulse">
                  <Sparkles className="w-8 h-8 text-primary" />
                </div>
                <h1 className="text-3xl font-black font-montserrat mb-2"><span className="gradient-text">Generating Your Quiz</span></h1>
                <p className="text-muted-foreground font-open-sans">
                  AI is analyzing your topic and creating personalized questions...
                </p>
              </div>

              <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
                <CardContent className="p-8">
                  <div className="space-y-4">
                    <div className="flex justify-between text-sm font-open-sans">
                      <span>Progress</span>
                      <span>{generationProgress}%</span>
                    </div>
                    <Progress value={generationProgress} className="h-2" />
                    <div className="text-center text-sm text-muted-foreground font-open-sans">
                      {generationProgress < 40 && "Analyzing topic and difficulty level..."}
                      {generationProgress >= 40 && generationProgress < 80 && "Generating questions and answers..."}
                      {generationProgress >= 80 && "Finalizing quiz and explanations..."}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {step === "quiz" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-black font-montserrat">Quiz: {topic}</h1>
                  <p className="text-muted-foreground font-open-sans">
                    Question {currentQuestion + 1} of {dummyQuestions.length}
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  <Badge className={getDifficultyColor(dummyQuestions[currentQuestion].difficulty)}>
                    {dummyQuestions[currentQuestion].difficulty}
                  </Badge>
                  <div className="flex items-center space-x-1 text-sm text-muted-foreground">
                    <Clock className="w-4 h-4" />
                    <span>2:30</span>
                  </div>
                </div>
              </div>

              <Progress value={((currentQuestion + 1) / dummyQuestions.length) * 100} />

              <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="font-montserrat text-lg">{dummyQuestions[currentQuestion].question}</CardTitle>
                </CardHeader>
                <CardContent>
                  <RadioGroup
                    value={answers[dummyQuestions[currentQuestion].id]?.toString()}
                    onValueChange={(value) =>
                      handleAnswerSelect(dummyQuestions[currentQuestion].id, Number.parseInt(value))
                    }
                  >
                    {dummyQuestions[currentQuestion].options.map((option, index) => (
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

                  <div className="flex justify-between mt-6">
                    <Button
                      variant="outline"
                      onClick={handlePreviousQuestion}
                      disabled={currentQuestion === 0}
                      className="border-border/50"
                    >
                      Previous
                    </Button>
                    <Button
                      onClick={handleNextQuestion}
                      disabled={answers[dummyQuestions[currentQuestion].id] === undefined}
                      className="font-semibold bg-gradient-to-r from-primary to-chart-5 hover:opacity-90 shadow-md shadow-primary/20"
                    >
                      {currentQuestion === dummyQuestions.length - 1 ? "Finish Quiz" : "Next Question"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {step === "results" && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="w-16 h-16 stat-icon-purple rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Target className="w-8 h-8 text-primary" />
                </div>
                <h1 className="text-3xl font-black font-montserrat mb-2"><span className="gradient-text">Quiz Complete!</span></h1>
                <p className="text-muted-foreground font-open-sans">Here are your results for the {topic} quiz</p>
              </div>

              <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
                <CardHeader className="text-center">
                  <CardTitle className="text-4xl font-black font-montserrat text-primary">
                    {calculateScore().percentage}%
                  </CardTitle>
                  <CardDescription className="font-open-sans">
                    {calculateScore().correct} out of {calculateScore().total} questions correct
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Progress value={calculateScore().percentage} className="h-3 mb-6" />

                  <div className="space-y-4">
                    {dummyQuestions.map((question, index) => {
                      const userAnswer = answers[question.id]
                      const isCorrect = userAnswer === question.correctAnswer

                      return (
                        <div key={question.id} className="border border-border rounded-lg p-4">
                          <div className="flex items-start space-x-3">
                            <div className="flex-shrink-0 mt-1">
                              {isCorrect ? (
                                <CheckCircle className="w-5 h-5 text-green-500" />
                              ) : (
                                <XCircle className="w-5 h-5 text-red-500" />
                              )}
                            </div>
                            <div className="flex-1">
                              <h4 className="font-medium font-montserrat mb-2">
                                Question {index + 1}: {question.question}
                              </h4>
                              <div className="space-y-1 text-sm font-open-sans">
                                <p className={`${isCorrect ? "text-green-600" : "text-red-600"}`}>
                                  Your answer: {question.options[userAnswer]}
                                </p>
                                {!isCorrect && (
                                  <p className="text-green-600">
                                    Correct answer: {question.options[question.correctAnswer]}
                                  </p>
                                )}
                                <p className="text-muted-foreground mt-2">{question.explanation}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  <div className="flex flex-col sm:flex-row gap-4 mt-6">
                    <Button onClick={resetQuiz} variant="outline" className="border-border/50">
                      <RotateCcw className="w-4 h-4 mr-2" />
                      Create New Quiz
                    </Button>
                    <Button variant="outline" className="border-border/50">
                      <Download className="w-4 h-4 mr-2" />
                      Download Results
                    </Button>
                    <Button variant="outline" className="border-border/50">
                      <Share className="w-4 h-4 mr-2" />
                      Share Results
                    </Button>
                  </div>
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
