'use client'

import { motion, HTMLMotionProps, useScroll, useTransform } from 'framer-motion'
import { ReactNode, useRef } from 'react'

interface ScrollRevealProps extends HTMLMotionProps<'div'> {
  children: ReactNode
  delay?: number
  direction?: 'up' | 'down' | 'left' | 'right' | 'none'
  distance?: number
  duration?: number
}

export const ScrollReveal = ({
  children,
  delay = 0,
  direction = 'up',
  distance = 30,
  duration = 0.6,
  ...props
}: ScrollRevealProps) => {
  const directions = {
    up: { y: distance },
    down: { y: -distance },
    left: { x: distance },
    right: { x: -distance },
    none: {},
  }

  return (
    <motion.div
      initial={{
        opacity: 0,
        ...directions[direction],
      }}
      whileInView={{
        opacity: 1,
        x: 0,
        y: 0,
      }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{
        duration,
        delay,
        ease: [0.21, 0.47, 0.32, 0.98],
      }}
      {...props}
    >
      {children}
    </motion.div>
  )
}

export const Parallax = ({
  children,
  offset = 50,
  ...props
}: {
  children: ReactNode
  offset?: number
} & HTMLMotionProps<'div'>) => {
  const ref = useRef(null)
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  })

  const y = useTransform(scrollYProgress, [0, 1], [-offset, offset])

  return (
    <motion.div ref={ref} style={{ y }} {...props}>
      {children}
    </motion.div>
  )
}

export const StaggerContainer = ({
  children,
  delayChildren = 0,
  staggerChildren = 0.1,
  ...props
}: {
  children: ReactNode
  delayChildren?: number
  staggerChildren?: number
} & HTMLMotionProps<'div'>) => {
  return (
    <motion.div
      initial="initial"
      whileInView="animate"
      viewport={{ once: true }}
      variants={{
        initial: {},
        animate: {
          transition: {
            delayChildren,
            staggerChildren,
          },
        },
      }}
      {...props}
    >
      {children}
    </motion.div>
  )
}

export const StaggerItem = ({
  children,
  distance = 20,
  ...props
}: {
  children: ReactNode
  distance?: number
} & HTMLMotionProps<'div'>) => {
  return (
    <motion.div
      variants={{
        initial: { opacity: 0, y: distance },
        animate: { opacity: 1, y: 0 },
      }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      {...props}
    >
      {children}
    </motion.div>
  )
}
