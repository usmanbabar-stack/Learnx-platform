"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Upload, FileVideo, CheckCircle, Brain, FileText, Target, ArrowLeft } from "lucide-react"
import Link from "next/link"
import { AuthGuard } from "@/components/auth-guard"

interface UploadStep {
  id: string
  title: string
  description: string
  completed: boolean
}

export default function UploadPage() {
  const [currentStep, setCurrentStep] = useState(0)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [isUploading, setIsUploading] = useState(false)
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    subject: "",
    difficulty: "",
    tags: "",
    file: null as File | null,
  })

  const steps: UploadStep[] = [
    {
      id: "upload",
      title: "Upload Video",
      description: "Select and upload your educational video",
      completed: false,
    },
    {
      id: "details",
      title: "Course Details",
      description: "Add title, description, and metadata",
      completed: false,
    },
    {
      id: "ai-processing",
      title: "AI Processing",
      description: "AI generates transcripts and learning materials",
      completed: false,
    },
    {
      id: "review",
      title: "Review & Publish",
      description: "Review generated content and publish",
      completed: false,
    },
  ]

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      setFormData({ ...formData, file })
      simulateUpload()
    }
  }

  const simulateUpload = () => {
    setIsUploading(true)
    setUploadProgress(0)

    const interval = setInterval(() => {
      setUploadProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval)
          setIsUploading(false)
          setCurrentStep(1)
          return 100
        }
        return prev + 10
      })
    }, 200)
  }

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1)
    }
  }

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleInputChange = (field: string, value: string) => {
    setFormData({ ...formData, [field]: value })
  }

  return (
    <AuthGuard>
      <div className="min-h-screen bg-background">
        {/* Header */}
        <div className="border-b border-border bg-card/50 backdrop-blur-sm">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="flex items-center space-x-4">
              <Button variant="ghost" size="sm" asChild>
                <Link href="/teacher">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Dashboard
                </Link>
              </Button>
              <div>
                <h1 className="text-2xl font-black font-montserrat">Upload Educational Content</h1>
                <p className="text-muted-foreground font-open-sans">
                  Transform your video into an interactive learning experience
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Progress Steps */}
          <div className="mb-8">
            <div className="flex items-center justify-between">
              {steps.map((step, index) => (
                <div key={step.id} className="flex items-center">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      index <= currentStep ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {index < currentStep ? (
                      <CheckCircle className="w-5 h-5" />
                    ) : (
                      <span className="text-sm font-bold">{index + 1}</span>
                    )}
                  </div>
                  {index < steps.length - 1 && (
                    <div className={`w-24 h-1 mx-4 ${index < currentStep ? "bg-accent" : "bg-muted"}`} />
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-4">
              {steps.map((step, index) => (
                <div key={step.id} className="text-center" style={{ width: "120px" }}>
                  <h3 className="text-sm font-medium font-montserrat">{step.title}</h3>
                  <p className="text-xs text-muted-foreground font-open-sans">{step.description}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Step Content */}
          <Card>
            <CardHeader>
              <CardTitle className="font-montserrat">{steps[currentStep].title}</CardTitle>
              <CardDescription className="font-open-sans">{steps[currentStep].description}</CardDescription>
            </CardHeader>
            <CardContent>
              {currentStep === 0 && (
                <div className="space-y-6">
                  <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
                    <FileVideo className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                    <h3 className="text-lg font-medium font-montserrat mb-2">Upload Your Video</h3>
                    <p className="text-muted-foreground font-open-sans mb-4">
                      Drag and drop your video file here, or click to browse
                    </p>
                    <input
                      type="file"
                      accept="video/*"
                      onChange={handleFileUpload}
                      className="hidden"
                      id="video-upload"
                    />
                    <Label htmlFor="video-upload">
                      <Button asChild>
                        <span>
                          <Upload className="w-4 h-4 mr-2" />
                          Choose File
                        </span>
                      </Button>
                    </Label>
                  </div>

                  {isUploading && (
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="font-open-sans">Uploading...</span>
                        <span className="font-open-sans">{uploadProgress}%</span>
                      </div>
                      <Progress value={uploadProgress} />
                    </div>
                  )}

                  {formData.file && !isUploading && (
                    <div className="flex items-center space-x-3 p-3 bg-muted rounded-lg">
                      <CheckCircle className="w-5 h-5 text-green-500" />
                      <div>
                        <p className="font-medium font-open-sans">{formData.file.name}</p>
                        <p className="text-sm text-muted-foreground font-open-sans">
                          {(formData.file.size / (1024 * 1024)).toFixed(2)} MB
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {currentStep === 1 && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="title" className="font-open-sans">
                        Course Title
                      </Label>
                      <Input
                        id="title"
                        placeholder="Enter course title"
                        value={formData.title}
                        onChange={(e) => handleInputChange("title", e.target.value)}
                        className="font-open-sans"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="subject" className="font-open-sans">
                        Subject
                      </Label>
                      <Select value={formData.subject} onValueChange={(value) => handleInputChange("subject", value)}>
                        <SelectTrigger className="font-open-sans">
                          <SelectValue placeholder="Select subject" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="computer-science">Computer Science</SelectItem>
                          <SelectItem value="mathematics">Mathematics</SelectItem>
                          <SelectItem value="physics">Physics</SelectItem>
                          <SelectItem value="chemistry">Chemistry</SelectItem>
                          <SelectItem value="biology">Biology</SelectItem>
                          <SelectItem value="business">Business</SelectItem>
                          <SelectItem value="finance">Finance</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description" className="font-open-sans">
                      Description
                    </Label>
                    <Textarea
                      id="description"
                      placeholder="Describe what students will learn in this course"
                      value={formData.description}
                      onChange={(e) => handleInputChange("description", e.target.value)}
                      className="font-open-sans"
                      rows={4}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="difficulty" className="font-open-sans">
                        Difficulty Level
                      </Label>
                      <Select
                        value={formData.difficulty}
                        onValueChange={(value) => handleInputChange("difficulty", value)}
                      >
                        <SelectTrigger className="font-open-sans">
                          <SelectValue placeholder="Select difficulty" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="beginner">Beginner</SelectItem>
                          <SelectItem value="intermediate">Intermediate</SelectItem>
                          <SelectItem value="advanced">Advanced</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="tags" className="font-open-sans">
                        Tags (comma-separated)
                      </Label>
                      <Input
                        id="tags"
                        placeholder="machine learning, python, data science"
                        value={formData.tags}
                        onChange={(e) => handleInputChange("tags", e.target.value)}
                        className="font-open-sans"
                      />
                    </div>
                  </div>
                </div>
              )}

              {currentStep === 2 && (
                <div className="space-y-6">
                  <div className="text-center py-8">
                    <Brain className="w-16 h-16 mx-auto mb-4 text-accent animate-pulse" />
                    <h3 className="text-lg font-medium font-montserrat mb-2">AI Processing Your Content</h3>
                    <p className="text-muted-foreground font-open-sans mb-6">
                      Our AI is analyzing your video and generating interactive learning materials
                    </p>
                    <Progress value={75} className="max-w-md mx-auto" />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card>
                      <CardContent className="p-4 text-center">
                        <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-500" />
                        <h4 className="font-medium font-montserrat">Transcript</h4>
                        <p className="text-sm text-muted-foreground font-open-sans">Generated</p>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardContent className="p-4 text-center">
                        <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-500" />
                        <h4 className="font-medium font-montserrat">Summary</h4>
                        <p className="text-sm text-muted-foreground font-open-sans">Generated</p>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardContent className="p-4 text-center">
                        <div className="w-8 h-8 mx-auto mb-2 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
                        <h4 className="font-medium font-montserrat">Quiz Questions</h4>
                        <p className="text-sm text-muted-foreground font-open-sans">Processing...</p>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              )}

              {currentStep === 3 && (
                <div className="space-y-6">
                  <div className="text-center">
                    <CheckCircle className="w-16 h-16 mx-auto mb-4 text-green-500" />
                    <h3 className="text-lg font-medium font-montserrat mb-2">Content Ready for Review</h3>
                    <p className="text-muted-foreground font-open-sans">
                      AI has generated all learning materials. Review and publish your course.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-sm font-montserrat flex items-center">
                          <FileText className="w-4 h-4 mr-2" />
                          Generated Materials
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-open-sans">Transcript</span>
                          <Badge variant="secondary">Ready</Badge>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-open-sans">Summary</span>
                          <Badge variant="secondary">Ready</Badge>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-open-sans">Flashcards (24)</span>
                          <Badge variant="secondary">Ready</Badge>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-open-sans">Quiz Questions (12)</span>
                          <Badge variant="secondary">Ready</Badge>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-sm font-montserrat flex items-center">
                          <Target className="w-4 h-4 mr-2" />
                          Course Preview
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          <h4 className="font-medium font-montserrat">{formData.title || "Course Title"}</h4>
                          <p className="text-sm text-muted-foreground font-open-sans">
                            {formData.description || "Course description"}
                          </p>
                          <div className="flex items-center space-x-2">
                            <Badge>{formData.subject || "Subject"}</Badge>
                            <Badge variant="outline">{formData.difficulty || "Difficulty"}</Badge>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              )}

              {/* Navigation Buttons */}
              <div className="flex justify-between pt-6 border-t border-border">
                <Button variant="outline" onClick={handleBack} disabled={currentStep === 0}>
                  Back
                </Button>
                <div className="space-x-2">
                  {currentStep === steps.length - 1 ? (
                    <>
                      <Button variant="outline">Save as Draft</Button>
                      <Button>Publish Course</Button>
                    </>
                  ) : (
                    <Button
                      onClick={handleNext}
                      disabled={
                        (currentStep === 0 && !formData.file) ||
                        (currentStep === 1 && (!formData.title || !formData.description))
                      }
                    >
                      {currentStep === 2 ? "Continue" : "Next"}
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AuthGuard>
  )
}
