"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Upload, Users, BarChart3, BookOpen, Play, Eye, TrendingUp, Plus, Edit, Download } from "lucide-react"
import Link from "next/link"
import { AuthGuard } from "@/components/auth-guard"

const mockTeacherData = {
  name: "Dr. Sarah Chen",
  email: "sarah.chen@university.edu",
  avatar: "/placeholder.svg?height=40&width=40&text=SC",
  totalStudents: 1247,
  totalCourses: 12,
  totalViews: 45230,
  avgRating: 4.8,
}

const mockCourses = [
  {
    id: "1",
    title: "Introduction to Machine Learning Fundamentals",
    students: 342,
    views: 12450,
    rating: 4.9,
    status: "published",
    lastUpdated: "2 days ago",
    thumbnail: "/placeholder.svg?height=100&width=150&text=ML+Course",
    duration: "12h 30m",
    lessons: 24,
  },
  {
    id: "2",
    title: "Advanced Neural Networks and Deep Learning",
    students: 189,
    views: 8920,
    rating: 4.7,
    status: "published",
    lastUpdated: "1 week ago",
    thumbnail: "/placeholder.svg?height=100&width=150&text=Neural+Networks",
    duration: "18h 45m",
    lessons: 32,
  },
  {
    id: "3",
    title: "Data Science with Python - Complete Guide",
    students: 0,
    views: 0,
    rating: 0,
    status: "draft",
    lastUpdated: "3 days ago",
    thumbnail: "/placeholder.svg?height=100&width=150&text=Python+DS",
    duration: "15h 20m",
    lessons: 28,
  },
]

const mockRecentActivity = [
  {
    id: "1",
    type: "new_enrollment",
    message: "25 new students enrolled in ML Fundamentals",
    time: "2 hours ago",
  },
  {
    id: "2",
    type: "question",
    message: "New Q&A question in Neural Networks course",
    time: "4 hours ago",
  },
  {
    id: "3",
    type: "review",
    message: "New 5-star review on ML Fundamentals",
    time: "1 day ago",
  },
]

const mockAnalytics = {
  weeklyViews: [120, 150, 180, 200, 170, 190, 220],
  enrollmentTrend: [10, 15, 12, 18, 25, 22, 30],
  completionRates: {
    "ML Fundamentals": 78,
    "Neural Networks": 65,
    "Python DS": 0,
  },
}

export default function TeacherDashboardPage() {
  const [activeTab, setActiveTab] = useState("overview")

  return (
    <AuthGuard>
      <div className="min-h-screen bg-background">
        {/* Header */}
        <div className="border-b border-border bg-card/50 backdrop-blur-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <Avatar className="w-12 h-12">
                  <AvatarImage src={mockTeacherData.avatar || "/placeholder.svg"} alt={mockTeacherData.name} />
                  <AvatarFallback>SC</AvatarFallback>
                </Avatar>
                <div>
                  <h1 className="text-2xl font-black font-montserrat">
                    Welcome, {mockTeacherData.name.split(" ")[1]}!
                  </h1>
                  <p className="text-muted-foreground font-open-sans">Manage your courses and track student progress</p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <Button asChild>
                  <Link href="/teacher/upload">
                    <Upload className="w-4 h-4 mr-2" />
                    Upload Content
                  </Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/teacher/create-course">
                    <Plus className="w-4 h-4 mr-2" />
                    New Course
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="overview" className="font-open-sans">
                Overview
              </TabsTrigger>
              <TabsTrigger value="courses" className="font-open-sans">
                My Courses
              </TabsTrigger>
              <TabsTrigger value="analytics" className="font-open-sans">
                Analytics
              </TabsTrigger>
              <TabsTrigger value="students" className="font-open-sans">
                Students
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6">
              {/* Stats Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium font-montserrat">Total Students</CardTitle>
                    <Users className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold font-montserrat">{mockTeacherData.totalStudents}</div>
                    <p className="text-xs text-muted-foreground font-open-sans">+12% from last month</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium font-montserrat">Total Courses</CardTitle>
                    <BookOpen className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold font-montserrat">{mockTeacherData.totalCourses}</div>
                    <p className="text-xs text-muted-foreground font-open-sans">3 published this month</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium font-montserrat">Total Views</CardTitle>
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold font-montserrat">
                      {mockTeacherData.totalViews.toLocaleString()}
                    </div>
                    <p className="text-xs text-muted-foreground font-open-sans">+8% from last week</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium font-montserrat">Average Rating</CardTitle>
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold font-montserrat">{mockTeacherData.avgRating}</div>
                    <p className="text-xs text-muted-foreground font-open-sans">Across all courses</p>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Recent Courses */}
                <div className="lg:col-span-2">
                  <Card>
                    <CardHeader>
                      <CardTitle className="font-montserrat">Recent Courses</CardTitle>
                      <CardDescription className="font-open-sans">Your latest course activity</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {mockCourses.slice(0, 3).map((course) => (
                        <div
                          key={course.id}
                          className="flex items-center space-x-4 p-4 border border-border rounded-lg hover:bg-muted/50 transition-colors"
                        >
                          <img
                            src={course.thumbnail || "/placeholder.svg"}
                            alt={course.title}
                            className="w-16 h-12 object-cover rounded"
                          />
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium font-montserrat truncate">{course.title}</h4>
                            <div className="flex items-center space-x-4 text-sm text-muted-foreground font-open-sans">
                              <span>{course.students} students</span>
                              <span>{course.views} views</span>
                              <Badge variant={course.status === "published" ? "default" : "secondary"}>
                                {course.status}
                              </Badge>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Button size="sm" variant="outline" asChild>
                              <Link href={`/teacher/courses/${course.id}`}>
                                <Edit className="w-3 h-3 mr-1" />
                                Edit
                              </Link>
                            </Button>
                            <Button size="sm" asChild>
                              <Link href={`/learn/${course.id}`}>
                                <Eye className="w-3 h-3 mr-1" />
                                View
                              </Link>
                            </Button>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </div>

                {/* Sidebar */}
                <div className="space-y-6">
                  {/* Recent Activity */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="font-montserrat">Recent Activity</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {mockRecentActivity.map((activity) => (
                        <div key={activity.id} className="flex items-start space-x-3">
                          <div className="w-2 h-2 bg-accent rounded-full mt-2"></div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium font-open-sans">{activity.message}</p>
                            <p className="text-xs text-muted-foreground font-open-sans">{activity.time}</p>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>

                  {/* Quick Actions */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="font-montserrat">Quick Actions</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <Button className="w-full justify-start bg-transparent" variant="outline" asChild>
                        <Link href="/teacher/upload">
                          <Upload className="w-4 h-4 mr-2" />
                          Upload Video
                        </Link>
                      </Button>
                      <Button className="w-full justify-start bg-transparent" variant="outline" asChild>
                        <Link href="/teacher/analytics">
                          <BarChart3 className="w-4 h-4 mr-2" />
                          View Analytics
                        </Link>
                      </Button>
                      <Button className="w-full justify-start bg-transparent" variant="outline" asChild>
                        <Link href="/teacher/students">
                          <Users className="w-4 h-4 mr-2" />
                          Manage Students
                        </Link>
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="courses" className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold font-montserrat">My Courses</h2>
                <div className="flex items-center space-x-2">
                  <Button variant="outline" asChild>
                    <Link href="/teacher/upload">
                      <Upload className="w-4 h-4 mr-2" />
                      Upload Content
                    </Link>
                  </Button>
                  <Button asChild>
                    <Link href="/teacher/create-course">
                      <Plus className="w-4 h-4 mr-2" />
                      New Course
                    </Link>
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {mockCourses.map((course) => (
                  <Card key={course.id} className="hover:shadow-lg transition-shadow">
                    <div className="relative">
                      <img
                        src={course.thumbnail || "/placeholder.svg"}
                        alt={course.title}
                        className="w-full h-40 object-cover rounded-t-lg"
                      />
                      <div className="absolute top-2 right-2">
                        <Badge variant={course.status === "published" ? "default" : "secondary"}>{course.status}</Badge>
                      </div>
                    </div>
                    <CardHeader>
                      <CardTitle className="font-montserrat line-clamp-2">{course.title}</CardTitle>
                      <CardDescription className="font-open-sans">
                        {course.lessons} lessons • {course.duration}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between text-sm">
                          <span className="flex items-center font-open-sans">
                            <Users className="w-3 h-3 mr-1" />
                            {course.students} students
                          </span>
                          <span className="flex items-center font-open-sans">
                            <Eye className="w-3 h-3 mr-1" />
                            {course.views} views
                          </span>
                        </div>
                        {course.rating > 0 && (
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-open-sans">Rating: {course.rating}/5</span>
                            <span className="text-muted-foreground font-open-sans">Updated {course.lastUpdated}</span>
                          </div>
                        )}
                        <div className="flex items-center space-x-2">
                          <Button size="sm" variant="outline" className="flex-1 bg-transparent" asChild>
                            <Link href={`/teacher/courses/${course.id}`}>
                              <Edit className="w-3 h-3 mr-1" />
                              Edit
                            </Link>
                          </Button>
                          <Button size="sm" className="flex-1" asChild>
                            <Link href={`/learn/${course.id}`}>
                              <Play className="w-3 h-3 mr-1" />
                              Preview
                            </Link>
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="analytics" className="space-y-6">
              <h2 className="text-2xl font-bold font-montserrat">Course Analytics</h2>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="font-montserrat">Weekly Views</CardTitle>
                    <CardDescription className="font-open-sans">Views across all courses</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold font-montserrat mb-2">
                      {mockAnalytics.weeklyViews.reduce((a, b) => a + b, 0)}
                    </div>
                    <p className="text-sm text-muted-foreground font-open-sans">This week</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="font-montserrat">New Enrollments</CardTitle>
                    <CardDescription className="font-open-sans">Students enrolled this week</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold font-montserrat mb-2">
                      {mockAnalytics.enrollmentTrend.reduce((a, b) => a + b, 0)}
                    </div>
                    <p className="text-sm text-muted-foreground font-open-sans">+15% from last week</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="font-montserrat">Avg. Completion Rate</CardTitle>
                    <CardDescription className="font-open-sans">Across published courses</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold font-montserrat mb-2">72%</div>
                    <p className="text-sm text-muted-foreground font-open-sans">Above platform average</p>
                  </CardContent>
                </Card>
              </div>

              {/* Course Performance */}
              <Card>
                <CardHeader>
                  <CardTitle className="font-montserrat">Course Performance</CardTitle>
                  <CardDescription className="font-open-sans">Completion rates by course</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {Object.entries(mockAnalytics.completionRates).map(([course, rate]) => (
                    <div key={course} className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="font-open-sans">{course}</span>
                        <span className="font-open-sans">{rate}%</span>
                      </div>
                      <Progress value={rate} />
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="students" className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold font-montserrat">Student Management</h2>
                <Button variant="outline">
                  <Download className="w-4 h-4 mr-2" />
                  Export Data
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="font-montserrat">Active Students</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold font-montserrat mb-2">892</div>
                    <p className="text-sm text-muted-foreground font-open-sans">Currently enrolled</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="font-montserrat">Completion Rate</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold font-montserrat mb-2">68%</div>
                    <p className="text-sm text-muted-foreground font-open-sans">Average across courses</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="font-montserrat">Engagement Score</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold font-montserrat mb-2">8.4/10</div>
                    <p className="text-sm text-muted-foreground font-open-sans">Based on activity</p>
                  </CardContent>
                </Card>
              </div>

              {/* Student Activity */}
              <Card>
                <CardHeader>
                  <CardTitle className="font-montserrat">Recent Student Activity</CardTitle>
                  <CardDescription className="font-open-sans">Latest interactions and progress</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-12 text-muted-foreground font-open-sans">
                    <Users className="w-12 h-12 mx-auto mb-4" />
                    <p>Student activity dashboard would be implemented here</p>
                    <p className="text-sm mt-2">Track individual progress, Q&A interactions, and engagement metrics</p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </AuthGuard>
  )
}
