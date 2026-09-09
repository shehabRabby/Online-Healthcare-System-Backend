import { NextFunction, Request, Response, Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { auth } from "../../middleware/checkAuth";
import { catchAsync } from "../../utils/catchAsync";
import z from "zod";
import { validateRequest } from "../../middleware/validateRequest";
import { DoctorController } from "./doctor.controller";
import { upload } from "../../lib/multer";

const router = Router();

router.post(
  "/apply-as-doctor",
  //   validateRequest(UserValidation.patientRegistrationZodSchema),

  upload.fields([
    {
      name: "resume",
      maxCount: 1,
    },
    {
      name: "additionalFiles",
      maxCount: 10,
    },
  ]),
  DoctorController.applyAsDoctor,
);

router.post(
  "/apply-as-doctor/verify-email",
  DoctorController.verifyDoctorEmail,
);
router.post(
  "/approved-doctor", auth(Role.ADMIN, Role.SUPER_ADMIN),
  DoctorController.approveDoctor,
);
router.get(
  "/all-doctors", auth(Role.ADMIN, Role.SUPER_ADMIN),
  DoctorController.getAllDoctors,
);

export const DoctorRoutes = router;
 