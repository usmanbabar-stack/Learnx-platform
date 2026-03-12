"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import {
  Upload,
  FileText,
  Image as ImageIcon,
  FileUp,
  CheckCircle,
  XCircle,
  Loader2,
  TrendingUp,
  BarChart3,
  Award,
  Brain,
  Target
} from "lucide-react"
import Link from "next/link"
import { AuthGuard } from "@/components/auth-guard"
import { Navigation } from "@/components/navigation"
import { useRouter } from "next/navigation"
import { useToast } from "@/hooks/use-toast"
import { safeStorage } from "@/lib/api"

export default function PastPaperAnalyzerPage() {
  const [files, setFiles] = useState<File[]>([])
  const [sessionName, setSessionName] = useState("")
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const { toast } = useToast()
  const router = useRouter()

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files || [])
    
    if (files.length + selectedFiles.length < 2) {
      toast({
        title: "Minimum Requirements",
        description: "Please select at least 2 past papers for analysis",
        variant: "destructive"
      })
      return
    }

    if (files.length + selectedFiles.length > 10) {
      toast({
        title: "Maximum Limit Reached",
        description: "You can upload a maximum of 10 papers at once",
        variant: "destructive"
      })
      return
    }

    setFiles([...files, ...selectedFiles])
  }

  const removeFile = (index: number) => {
    setFiles(files.filter((_, i) => i !== index))
  }

  const handleUpload = async  () => {
    if (files.length < 2) {
      toast({
        title: "Error",
        description: "Please select at least 2 past papers",
        variant: "destructive"
      })
      return
    }

    if (files.length > 10) {
      toast({
        title: "Error",
        description: "Maximum 10 papers allowed per session",
        variant: "destructive"
      })
      return
    }

    try {
      setIsUploading(true)
      setUploadProgress(0)

      const formData = new FormData()
      files.forEach(file => {
        formData.append('papers', file)
      })
      formData.append('session_name', sessionName || `Analysis ${new Date().toLocaleDateString()}`)

      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) return prev
          return prev + 10
        })
      }, 300)

      // Make actual API call
      const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'
      const token = safeStorage.getItem('auth-token')
      
      console.log('Token for upload:', token ? `${token.substring(0, 20)}...` : 'NO TOKEN')
      
      if (!token) {
        clearInterval(progressInterval)
        toast({
          title: "Authentication Required",
          description: "Please logout and login again to refresh your session",
          variant: "destructive"
        })
        setTimeout(() => router.push('/login'), 2000)
        setIsUploading(false)
        return
      }
      
      const response = await fetch(`${API_BASE_URL}/past-papers/sessions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      })

      clearInterval(progressInterval)
      setUploadProgress(100)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Upload failed' }))
        
        if (response.status === 401) {
          // Authentication error - clear storage and redirect to login
          safeStorage.removeItem('auth-token')
          safeStorage.removeItem('learnx_user')
          toast({
            title: "Session Expired",
            description: "Please login again to continue",
            variant: "destructive"
          })
          setTimeout(() => router.push('/login'), 2000)
          setIsUploading(false)
          return
        }
        
        throw new Error(errorData.message || 'Failed to upload papers')
      }

      const result = await response.json()

      toast({
        title: "Upload Successful!",
        description: `${files.length} papers uploaded. Analysis in progress...`,
      })

      // Redirect to results page with actual session ID
      setTimeout(() => {
        router.push(`/past-paper-analyzer/session/${result.data.sessionId}`)
      }, 1500)

    } catch (error: any) {
      console.error('Upload error:', error)
      toast({
        title: "Upload Failed",
        description: error.message || "Failed to upload papers. Please try again.",
        variant: "destructive"
      })
      setIsUploading(false)
    }
  }

  return (
    <AuthGuard>
      <div className="min-h-screen bg-background relative">
        <div className="absolute inset-0 mesh-gradient pointer-events-none" />
        <div className="relative z-10">
        <Navigation />
        
        {/* Header */}
        <div className="border-b border-border/50 glass">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <div className="flex items-center space-x-4 mb-4">
              <div className="p-3 bg-gradient-to-br from-primary to-chart-5 rounded-xl shadow-lg shadow-primary/20">
                <Brain className="w-8 h-8 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-4xl font-black font-montserrat text-foreground">
                  <span className="gradient-text">Past Paper Analyzer</span>
                </h1>
                <p className="text-lg text-muted-foreground font-open-sans mt-2">
                  Upload 2-10 past exam papers and get AI-powered insights, patterns, and study recommendations
                </p>
              </div>
            </div>

            {/* Features */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-8">
              <div className="flex items-start space-x-3 bg-card/60 dark:bg-card/30 backdrop-blur-sm p-4 rounded-xl border border-border/50 hover-lift">
                <TrendingUp className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-sm">Pattern Detection</p>
                  <p className="text-xs text-muted-foreground">Identify recurring questions and topics</p>
                </div>
              </div>
              <div className="flex items-start space-x-3 bg-card/60 dark:bg-card/30 backdrop-blur-sm p-4 rounded-xl border border-border/50 hover-lift">
                <BarChart3 className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-sm">Topic Frequency</p>
                  <p className="text-xs text-muted-foreground">See which topics appear most often</p>
                </div>
              </div>
              <div className="flex items-start space-x-3 bg-card/60 dark:bg-card/30 backdrop-blur-sm p-4 rounded-xl border border-border/50 hover-lift">
                <Award className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-sm">Practice Sets</p>
                  <p className="text-xs text-muted-foreground">Get targeted practice questions</p>
                </div>
              </div>
              <div className="flex items-start space-x-3 bg-card/60 dark:bg-card/30 backdrop-blur-sm p-4 rounded-xl border border-border/50 hover-lift">
                <Target className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-sm">Study Recommendations</p>
                  <p className="text-xs text-muted-foreground">AI-powered study tips and focus areas</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Upload Section */}
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Card className="border-border/50 bg-card/80 backdrop-blur-sm animate-slide-up">
            <CardHeader>
              <CardTitle className="font-montserrat">Upload Past Papers</CardTitle>
              <CardDescription className="font-open-sans">
                Upload 2-10 past exam papers in PDF, Image (JPG/PNG), TXT, or DOCX format
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Session Name */}
              <div className="space-y-2">
                <Label htmlFor="session-name" className="font-montserrat">
                  Analysis Session Name (Optional)
                </Label>
                <Input
                  id="session-name"
                  placeholder="e.g., Final Exam Preparation 2026"
                  value={sessionName}
                  onChange={(e) => setSessionName(e.target.value)}
                  disabled={isUploading}
                />
                <p className="text-xs text-muted-foreground">
                  Give your analysis session a name to easily find it later
                </p>
              </div>

              {/* File Upload Area */}
              <div className="space-y-2">
                <Label className="font-montserrat">Upload Files (2-10 papers)</Label>
                <div className="border-2 border-dashed border-border/50 rounded-xl p-8 text-center hover:bg-muted/30 hover:border-primary/30 transition-colors">
                  <div className="flex flex-col items-center">
                    <FileUp className="w-12 h-12 text-muted-foreground mb-4" />
                    <p className="text-sm font-medium mb-2">
{files.length > 0 ? `${files.length} file(s) selected` : 'Click to select files'}
                    </p>
                    <p className="text-xs text-muted-foreground mb-4">
                      Supported formats: PDF, JPG, PNG, TXT, DOCX • Max 50MB per file
                    </p>
                    <Input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.txt,.docx,application/pdf,image/jpeg,image/png,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      multiple
                      onChange={handleFileSelect}
                      className="mt-2"
                      disabled={isUploading}
                    />
                  </div>
                </div>
              </div>

              {/* File List */}
              {files.length > 0 && (
                <div className="space-y-2">
                  <Label className="font-montserrat">Selected Files</Label>
                  <div className="border rounded-xl divide-y border-border/50 max-h-64 overflow-y-auto">
                    {files.map((file, index) => (
                      <div key={index} className="flex items-center justify-between p-3 hover:bg-muted/50">
                        <div className="flex items-center space-x-3 flex-1">
                          {file.type.startsWith('image/') ? (
                            <ImageIcon className="w-5 h-5 text-blue-600 flex-shrink-0" />
                          ) : (
                            <FileText className="w-5 h-5 text-green-600 flex-shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{file.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {(file.size / 1024 / 1024).toFixed(2)} MB
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeFile(index)}
                          disabled={isUploading}
                        >
                          <XCircle className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  {files.length < 2 && (
                    <p className="text-xs text-yellow-600 dark:text-yellow-500 flex items-center gap-2">
                      <span className="inline-block w-1.5 h-1.5 bg-yellow-600 rounded-full" />
                      Please select at least 2 papers for analysis
                    </p>
                  )}
                  {files.length > 10 && (
                    <p className="text-xs text-red-600 dark:text-red-500 flex items-center gap-2">
                      <XCircle className="w-4 h-4" />
                      Maximum 10 papers allowed. Please remove some files.
                    </p>
                  )}
                </div>
              )}

              {/* Upload Progress */}
              {isUploading && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Uploading and processing papers...
                    </span>
                    <span className="text-muted-foreground">{Math.round(uploadProgress)}%</span>
                  </div>
                  <Progress value={uploadProgress} />
                  <p className="text-xs text-muted-foreground">
                    AI is extracting questions and analyzing patterns. This may take a few minutes.
                  </p>
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end space-x-3 pt-4">
                <Button variant="outline" asChild disabled={isUploading}>
                  <Link href="/dashboard">Cancel</Link>
                </Button>
                <Button
                  onClick={handleUpload}
                  disabled={files.length < 2 || files.length > 10 || isUploading}
                  className="font-semibold bg-gradient-to-r from-primary to-chart-5 hover:opacity-90 shadow-md shadow-primary/20"
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 mr-2" />
                      Analyze Papers
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Info Section */}
          <Card className="mt-6 border-border/50 bg-card/80 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-lg font-montserrat">How It Works</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0 w-6 h-6 bg-primary/10 text-primary rounded-full flex items-center justify-center text-sm font-bold">
                  1
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">Upload Your Papers</p>
                  <p className="text-xs text-muted-foreground">
                    Select 2-10 past exam papers in PDF, image, or document format
                  </p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0 w-6 h-6 bg-primary/10 text-primary rounded-full flex items-center justify-center text-sm font-bold">
                  2
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">AI Analysis</p>
                  <p className="text-xs text-muted-foreground">
                    Our AI extracts questions, identifies topics, assesses difficulty, and detects patterns
                  </p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0 w-6 h-6 bg-primary/10 text-primary rounded-full flex items-center justify-center text-sm font-bold">
                  3
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">Get Insights</p>
                  <p className="text-xs text-muted-foreground">
                    View topic frequency, difficulty distribution, study recommendations, and practice questions
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
        </div>
      </div>
    </AuthGuard>
  )
}
