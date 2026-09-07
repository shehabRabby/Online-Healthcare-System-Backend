import { NextFunction, Request, Response, Router } from "express";
import { AppointmentController } from "./appointment.controller";
import { auth } from "../../middleware/checkAuth";
import { Role } from "../../../generated/prisma/enums";

const router = Router();



router.post(
  "/book-appointment",
  auth(Role.PATIENT),
  AppointmentController.bookAppointment,
);
router.post(
  "/pay-appointment",
  auth(Role.PATIENT),
  AppointmentController.payAppointment,
);
router.post(
  "/cancel-appointment",
  auth(Role.PATIENT, Role.ADMIN, Role.SUPER_ADMIN),
  AppointmentController.cancelAppointment,
);

// book appointment callback route
router.get(
  "/book-appointment/payment/callback",
  AppointmentController.bookAppointmentCallback,
);
export const AppointmentRoutes = router;
