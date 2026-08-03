import { profileService } from '../services/profile.service.js'
import { asyncHandler } from '../utils/async-handler.js'
import { validate } from '../middleware/validate.middleware.js'
import { updateProfileBodySchema } from '../validators/index.js'

export const profileController = {
  get: asyncHandler(async (req, res) => {
    res.json(await profileService.getProfile(req.userId as string))
  }),

  update: [
    validate(updateProfileBodySchema),
    asyncHandler(async (req, res) => {
      res.json(await profileService.updateProfile(req.userId as string, req.body))
    }),
  ],
}
