import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { auth } from "../../middleware/checkAuth";
import { AuthController } from "./auth.controller";
import { UserValidation } from "./auth.validation";
import { validateRequest } from "../../middleware/validateRequest";

const router = Router();

router.post(
  "/register",
  validateRequest(UserValidation.patientRegistrationZodSchema),
  AuthController.registerPatient,
);

router.post(
  "/verify-email",
  validateRequest(UserValidation.patientEmailVerifyZodSchema),
  AuthController.verifyPatientEmail,
);

router.post(
  "/login",
  validateRequest(UserValidation.LoginZodSchema),
  AuthController.loginUser,
);
router.get(
  "/me",
  auth(Role.ADMIN, Role.DOCTOR, Role.PATIENT, Role.SUPER_ADMIN),
  //validateRequest
  AuthController.getMe,
);

router.post("/refresh-token", AuthController.refreshToken);
router.post("/google", AuthController.googleLogin);

router.post(
  "/forgot-password",
  validateRequest(UserValidation.ForgetPasswordZodSchema),
  AuthController.forgetPassword,
);
router.post(
  "/reset-password",
  validateRequest(UserValidation.ResetPasswordZodSchema),
  AuthController.resetPassword,
);
router.post("/logout", AuthController.logout);
export const AuthRoutes = router;
