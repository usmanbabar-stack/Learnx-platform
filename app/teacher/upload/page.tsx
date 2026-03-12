"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Upload, FileVideo, FileAudio, FileText, CheckCircle, ArrowLeft, Loader2 } from "lucide-react"
import Link from "next/link"
import { AuthGuard } from "@/components/auth-guard"
import { Navigation } from "@/components/navigation"
import { apiService } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"

type FileType = 'video' | 'audio' | 'document';

export default function UploadPage() {
  const [fileType, setFileType] = useState<FileType>('video')
  const [uploadProgress, setUploadProgress] = useState(0)
  const [isUploading, setIsUploading] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [uploadSuccess, setUploadSuccess] = useState(false)
  const { toast } = useToast()
  const router = useRouter()

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    subject: "Other",
    difficulty: "intermediate",
    language: "en-US",
    file: null as File | null,
  })

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      setFormData({ ...formData, file })
    }
  }

  const handleSubmit = async () => {
    if (!formData.file) {
      toast({
        title: "Error",
        description: "Please select a file to upload",
        variant: "destructive"
      })
      return
    }

    if (!formData.title.trim()) {
      toast({
        title: "Error",
        description: "Please enter a lecture title",
        variant: "destructive"
      })
      return
    }

    try {
      setIsUploading(true)
      setUploadProgress(0)

      const data = new FormData()
      data.append('file', formData.file)
      data.append('title', formData.title)
      data.append('description', formData.description)
      data.append('subject', formData.subject)
      data.append('difficulty', formData.difficulty)
      data.append('language', formData.language)
      data.append('fileType', fileType)

      const result = await apiService.uploadLecture(data, (percentage) => {
        setUploadProgress(percentage)
      })

      if (result.success) {
        setIsUploading(false)
        setIsProcessing(true)

        toast({
          title: "Upload Successful!",
          description: `Lecture uploaded and processed. ${result.data.notesGenerated ? 'Notes generated.' : ''} ${result.data.questionsGenerated ? 'Questions generated.' : ''}`,
        })

        setUploadSuccess(true)

        // Redirect to dashboard after 2 seconds
        setTimeout(() => {
          router.push('/teacher')
        }, 2000)
      }
    } catch (error: any) {
      console.error('Upload error:', error)
      toast({
        title: "Upload Failed",
        description: error.message || "Failed to upload lecture. Please try again.",
        variant: "destructive"
      })
      setIsUploading(false)
      setIsProcessing(false)
    }
  }

  const getAcceptedFileTypes = () => {
    switch (fileType) {
      case 'video':
        return 'video/mp4,video/mpeg,video/quicktime,video/x-msvideo,video/webm,video/x-matroska'
      case 'audio':
        return 'audio/mpeg,audio/mp3,audio/wav,audio/webm,audio/ogg,audio/mp4,audio/aac,audio/flac'
      case 'document':
        return 'application/pdf,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx,text/plain,.txt,application/vnd.openxmlformats-officedocument.presentationml.presentation,.pptx'
      default:
        return '*'
    }
  }

  const getFileTypeIcon = () => {
    switch (fileType) {
      case 'video': return <FileVideo className="w-6 h-6" />
      case 'audio': return <FileAudio className="w-6 h-6" />
      case 'document': return <FileText className="w-6 h-6" />
    }
  }

  const getFileTypeDescription = () => {
    switch (fileType) {
      case 'video':
        return 'Upload video lectures (MP4, AVI, MOV, WebM, MKV). Will be transcribed using speech recognition.'
      case 'audio':
        return 'Upload audio recordings (MP3, WAV, AAC, FLAC, OGG). Will be transcribed using speech recognition.'
      case 'document':
        return 'Upload documents (PDF, DOCX, TXT, PPTX). Text will be extracted directly from the file.'
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
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="flex items-center space-x-4">
              <Button variant="ghost" size="sm" asChild className="hover:bg-muted/50">
                <Link href="/teacher">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Dashboard
                </Link>
              </Button>
              <div>
                <h1 className="text-2xl font-black font-montserrat">Upload Educational Content</h1>
                <p className="text-muted-foreground font-open-sans">
                  Transform your content into interactive learning materials with AI
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {uploadSuccess ? (
            <Card className="border-green-500/50 bg-green-50/80 dark:bg-green-950/20 backdrop-blur-sm animate-scale-in">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <div className="w-16 h-16 bg-green-500/20 rounded-2xl flex items-center justify-center mb-4">
                  <CheckCircle className="w-10 h-10 text-green-600" />
                </div>
                <h2 className="text-2xl font-bold mb-2 font-montserrat">Upload Successful!</h2>
                <p className="text-muted-foreground mb-4 font-open-sans">
                  Your lecture has been processed and AI content has been generated.
                </p>
                <Button onClick={() => router.push('/teacher')} className="font-semibold bg-gradient-to-r from-primary to-chart-5 hover:opacity-90 shadow-md shadow-primary/20">
                  Go to Dashboard
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-border/50 bg-card/80 backdrop-blur-sm animate-slide-up">
              <CardHeader>
                <CardTitle className="font-montserrat">Upload Lecture Content</CardTitle>
                <CardDescription className="font-open-sans">
                  Choose your file type and upload your educational content
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* File Type Selection */}
                <div className="space-y-3">
                  <Label className="font-montserrat">What type of file are you uploading?</Label>
                  <RadioGroup value={fileType} onValueChange={(value) => setFileType(value as FileType)}>
                    <div className="flex items-center space-x-2 p-3 border border-border/50 rounded-xl hover:bg-muted/30 cursor-pointer transition-colors">
                      <RadioGroupItem value="video" id="video" />
                      <Label htmlFor="video" className="flex-1 cursor-pointer">
                        <div className="flex items-center">
                          <FileVideo className="w-5 h-5 mr-2 text-primary" />
                          <div>
                            <div className="font-medium">Video Lecture</div>
                            <div className="text-sm text-muted-foreground">MP4, AVI, MOV, WebM, MKV</div>
                          </div>
                        </div>
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2 p-3 border border-border/50 rounded-xl hover:bg-muted/30 cursor-pointer transition-colors">
                      <RadioGroupItem value="audio" id="audio" />
                      <Label htmlFor="audio" className="flex-1 cursor-pointer">
                        <div className="flex items-center">
                          <FileAudio className="w-5 h-5 mr-2 text-primary" />
                          <div>
                            <div className="font-medium">Audio Recording</div>
                            <div className="text-sm text-muted-foreground">MP3, WAV, AAC, FLAC, OGG</div>
                          </div>
                        </div>
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2 p-3 border border-border/50 rounded-xl hover:bg-muted/30 cursor-pointer transition-colors">
                      <RadioGroupItem value="document" id="document" />
                      <Label htmlFor="document" className="flex-1 cursor-pointer">
                        <div className="flex items-center">
                          <FileText className="w-5 h-5 mr-2 text-primary" />
                          <div>
                            <div className="font-medium">Document</div>
                            <div className="text-sm text-muted-foreground">PDF, DOCX, TXT, PPTX</div>
                          </div>
                        </div>
                      </Label>
                    </div>
                  </RadioGroup>
                  <p className="text-sm text-muted-foreground">{getFileTypeDescription()}</p>
                </div>

                {/* File Upload */}
                <div className="space-y-2">
                  <Label htmlFor="file" className="font-montserrat">Upload File</Label>
                  <div className="border-2 border-dashed border-border/50 rounded-xl p-8 text-center hover:bg-muted/30 hover:border-primary/30 transition-colors">
                    <div className="flex flex-col items-center">
                      {getFileTypeIcon()}
                      <p className="mt-2 text-sm font-medium">
                        {formData.file ? formData.file.name : 'Click to select file'}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Max file size: 500MB
                      </p>
                      <Input
                        id="file"
                        type="file"
                        accept={getAcceptedFileTypes()}
                        onChange={handleFileUpload}
                        className="mt-4"
                        disabled={isUploading || isProcessing}
                      />
                    </div>
                  </div>
                </div>

                {/* Title */}
                <div className="space-y-2">
                  <Label htmlFor="title" className="font-montserrat">Lecture Title *</Label>
                  <Input
                    id="title"
                    placeholder="e.g., Introduction to Machine Learning"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    disabled={isUploading || isProcessing}
                    className="h-11 bg-muted/50 border-border/50 focus:border-primary/50 focus:ring-primary/20"
                  />
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <Label htmlFor="description" className="font-montserrat">Description</Label>
                  <Textarea
                    id="description"
                    placeholder="Brief description of the lecture content..."
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={3}
                    disabled={isUploading || isProcessing}
                    className="bg-muted/50 border-border/50 focus:border-primary/50 focus:ring-primary/20"
                  />
                </div>

                {/* Subject and Difficulty */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="subject" className="font-montserrat">Subject</Label>
                    <Select value={formData.subject} onValueChange={(value) => setFormData({ ...formData, subject: value })}>
                      <SelectTrigger disabled={isUploading || isProcessing} className="h-11 bg-muted/50 border-border/50">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Computer Science">Computer Science</SelectItem>
                        <SelectItem value="Mathematics">Mathematics</SelectItem>
                        <SelectItem value="Physics">Physics</SelectItem>
                        <SelectItem value="Chemistry">Chemistry</SelectItem>
                        <SelectItem value="Biology">Biology</SelectItem>
                        <SelectItem value="Engineering">Engineering</SelectItem>
                        <SelectItem value="Business">Business</SelectItem>
                        <SelectItem value="Economics">Economics</SelectItem>
                        <SelectItem value="Psychology">Psychology</SelectItem>
                        <SelectItem value="History">History</SelectItem>
                        <SelectItem value="Literature">Literature</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="difficulty" className="font-montserrat">Difficulty</Label>
                    <Select value={formData.difficulty} onValueChange={(value) => setFormData({ ...formData, difficulty: value })}>
                      <SelectTrigger disabled={isUploading || isProcessing} className="h-11 bg-muted/50 border-border/50">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="beginner">Beginner</SelectItem>
                        <SelectItem value="intermediate">Intermediate</SelectItem>
                        <SelectItem value="advanced">Advanced</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Language (for audio/video only) */}
                {(fileType === 'video' || fileType === 'audio') && (
                  <div className="space-y-2">
                    <Label htmlFor="language" className="font-montserrat">Language (for transcription)</Label>
                    <Select value={formData.language} onValueChange={(value) => setFormData({ ...formData, language: value })}>
                      <SelectTrigger disabled={isUploading || isProcessing} className="h-11 bg-muted/50 border-border/50">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="en-US">English (US)</SelectItem>
                        <SelectItem value="en-IN">English (India)</SelectItem>
                        <SelectItem value="en">English (General)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Upload Progress */}
                {(isUploading || isProcessing) && (
                  <div className="space-y-2 p-4 bg-primary/5 border border-primary/10 rounded-xl">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">
                        {isUploading ? 'Uploading...' : 'Processing with AI...'}
                      </span>
                      <span className="text-muted-foreground">
                        {isUploading ? `${Math.round(uploadProgress)}%` : ''}
                      </span>
                    </div>
                    <Progress value={isUploading ? uploadProgress : undefined} className={isProcessing ? 'animate-pulse' : ''} />
                    <p className="text-xs text-muted-foreground">
                      {isProcessing && 'Generating notes and questions... This may take a few minutes.'}
                    </p>
                  </div>
                )}

                {/* Submit Button */}
                <div className="flex justify-end space-x-3 pt-4">
                  <Button variant="outline" asChild disabled={isUploading || isProcessing} className="border-border/50">
                    <Link href="/teacher">Cancel</Link>
                  </Button>
                  <Button 
                    onClick={handleSubmit} 
                    disabled={!formData.file || !formData.title.trim() || isUploading || isProcessing}
                    className="font-semibold bg-gradient-to-r from-primary to-chart-5 hover:opacity-90 shadow-md shadow-primary/20"
                  >
                    {(isUploading || isProcessing) ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        {isUploading ? 'Uploading...' : 'Processing...'}
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4 mr-2" />
                        Upload & Process
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
        </div>
      </div>
    </AuthGuard>
  )
}
