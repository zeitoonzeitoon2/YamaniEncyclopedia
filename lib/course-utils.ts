import { prisma } from './prisma'

/**
 * Checks if adding a prerequisite would create a circular dependency.
 * @param courseId The ID of the course that will have the prerequisite.
 * @param prerequisiteCourseId The ID of the course that is being proposed as a prerequisite.
 * @returns True if a circular dependency would be created, false otherwise.
 */
export async function causesCircularDependency(courseId: string, prerequisiteCourseId: string): Promise<boolean> {
  // If the course is its own prerequisite, that's a cycle
  if (courseId === prerequisiteCourseId) return true

  const visited = new Set<string>()
  const queue = [prerequisiteCourseId]

  while (queue.length > 0) {
    const currentId = queue.shift()!
    if (currentId === courseId) return true
    
    if (visited.has(currentId)) continue
    visited.add(currentId)

    // Find all approved or pending prerequisites of the current course
    const prerequisites = await prisma.coursePrerequisite.findMany({
      where: {
        courseId: currentId,
        status: { in: ['APPROVED', 'PENDING'] }
      },
      select: { prerequisiteCourseId: true }
    })

    for (const p of prerequisites) {
      queue.push(p.prerequisiteCourseId)
    }
  }

  return false
}

/**
 * Checks if a user is authorized to examine a specific course.
 * Authorization is granted if:
 * 1. The user is an ADMIN.
 * 2. The user is a domain expert (HEAD or EXPERT) for the course's domain.
 * 3. The user has passed all 'TEACH' type prerequisites for the course.
 */
export async function canExamineCourse(userId: string, courseId: string): Promise<boolean> {
  if (!userId || !courseId) return false

  // 1. Check if user is an ADMIN
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true }
  })
  if (user?.role === 'ADMIN') return true

  // Get course details (domainId)
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { domainId: true }
  })
  if (!course) return false

  // 2. Check if user is a domain expert
  const expert = await prisma.domainExpert.findFirst({
    where: {
      userId,
      domainId: course.domainId,
      role: { in: ['HEAD', 'EXPERT'] }
    }
  })
  if (expert) return true

  // 3. Check 'TEACH' type prerequisites
  const teachPrereqs = await prisma.coursePrerequisite.findMany({
    where: {
      courseId,
      status: 'APPROVED',
      type: 'TEACH'
    },
    select: { prerequisiteCourseId: true }
  })

  // If there are no TEACH prerequisites and user is not an expert, they can't examine
  if (teachPrereqs.length === 0) return false

  // Check if user has passed all of them
  const passedPrereqs = await prisma.userCourse.findMany({
    where: {
      userId,
      status: 'PASSED',
      courseId: { in: teachPrereqs.map(p => p.prerequisiteCourseId) }
    },
    select: { courseId: true }
  })

  return passedPrereqs.length === teachPrereqs.length
}
