"use client"

import type React from "react"
import { Navigation } from "@/components/navigation"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Brain, ArrowLeft, Mail } from "lucide-react"
import Link from "next/link"

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    // Simulate password reset process
    await new Promise((resolve) => setTimeout(resolve, 1000))

    console.log("Password reset requested for:", email)
    setIsSubmitted(true)
    setIsLoading(false)
  }

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-background relative overflow-hidden flex items-center justify-center p-4">
        <div className="absolute inset-0 mesh-gradient" />
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/8 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-chart-5/8 rounded-full blur-3xl" />
        
        <div className="relative z-10 w-full max-w-md animate-scale-in">
          <div className="flex items-center justify-center mb-6">
            <div className="flex items-center space-x-2">
              <div className="w-10 h-10 bg-gradient-to-br from-primary to-chart-5 rounded-xl flex items-center justify-center shadow-md">
                <Brain className="w-6 h-6 text-white" />
              </div>
              <span className="text-2xl font-black font-montserrat gradient-text">LEARNX</span>
            </div>
          </div>

          <Card className="border-border/50 bg-card/80 backdrop-blur-xl shadow-xl shadow-primary/5 text-center">
            <CardHeader>
              <div className="w-16 h-16 bg-gradient-to-br from-primary/20 to-chart-5/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Mail className="w-8 h-8 text-primary" />
              </div>
              <CardTitle className="text-2xl font-black font-montserrat">Check Your Email</CardTitle>
              <CardDescription className="font-open-sans">
                We&apos;ve sent a password reset link to <strong>{email}</strong>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground font-open-sans">
                Didn&apos;t receive the email? Check your spam folder or try again.
              </p>
              <div className="space-y-2">
                <Button onClick={() => setIsSubmitted(false)} variant="outline" className="w-full h-11 font-open-sans border-border/50">
                  Try Different Email
                </Button>
                <Button asChild className="w-full h-11 font-open-sans font-semibold bg-gradient-to-r from-primary to-chart-5 hover:opacity-90 shadow-md shadow-primary/20">
                  <Link href="/login">Back to Sign In</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background relative overflow-hidden flex items-center justify-center p-4">
      <div className="absolute inset-0 mesh-gradient" />
      <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/8 rounded-full blur-3xl" />
      <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-chart-5/8 rounded-full blur-3xl" />
      
      <div className="relative z-10 w-full max-w-md animate-scale-in">
        {/* Logo */}
        <div className="flex items-center justify-center mb-6">
          <div className="flex items-center space-x-2">
            <div className="w-10 h-10 bg-gradient-to-br from-primary to-chart-5 rounded-xl flex items-center justify-center shadow-md">
              <Brain className="w-6 h-6 text-white" />
            </div>
            <span className="text-2xl font-black font-montserrat gradient-text">LEARNX</span>
          </div>
        </div>

        <Card className="border-border/50 bg-card/80 backdrop-blur-xl shadow-xl shadow-primary/5">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-black font-montserrat">Reset Password</CardTitle>
            <CardDescription className="font-open-sans">
              Enter your email address and we&apos;ll send you a link to reset your password
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="font-open-sans text-sm font-medium">
                  Email Address
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="font-open-sans h-11 bg-muted/50 border-border/50 focus:border-primary/50 focus:ring-primary/20"
                />
              </div>

              <Button type="submit" className="w-full h-11 font-open-sans font-semibold bg-gradient-to-r from-primary to-chart-5 hover:opacity-90 shadow-md shadow-primary/20" disabled={isLoading}>
                {isLoading ? "Sending Reset Link..." : "Send Reset Link"}
              </Button>
            </form>

            <div className="mt-6 text-center">
              <Link
                href="/login"
                className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors font-open-sans"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Sign In
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
