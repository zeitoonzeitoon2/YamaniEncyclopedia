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
