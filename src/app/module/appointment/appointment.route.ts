import { NextFunction, Request, Response, Router } from "express";
import { AppointmentController } from "./appointment.controller";

const router = Router();

router.post("/book-appointment", AppointmentController.bookAppointment);

// book appointment callback route
router.get("/book-appointment/payment/callback", AppointmentController.bookAppointmentCallback);
export const AppointmentRoutes = router;
