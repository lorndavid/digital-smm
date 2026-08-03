import type { NextFunction, Request, Response } from 'express'
import { z } from 'zod'
import { ApiError } from '../utils/api-error.js'

/** Validates and replaces req.body with the parsed (typed) data. */
export function validate(schema: z.ZodType) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body)
    if (!result.success) {
      next(new ApiError(400, 'Validation failed', result.error.issues))
      return
    }
    req.body = result.data
    next()
  }
}

/** Validates query params into req.validatedQuery. */
export function validateQuery(schema: z.ZodType) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query)
    if (!result.success) {
      next(new ApiError(400, 'Invalid query parameters', result.error.issues))
      return
    }
    req.validatedQuery = result.data as Record<string, unknown>
    next()
  }
}
