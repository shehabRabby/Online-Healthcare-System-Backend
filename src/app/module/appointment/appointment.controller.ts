import { Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import httpStatus from "http-status";
import { AppointmentService } from "./appointment.service";

const bookAppointment = catchAsync(async (req: Request, res: Response) => {
  const result = await AppointmentService.bookAppointment();

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Appointment Booked Successfully",
    data: result,
  });
});

const bookAppointmentCallback = catchAsync(
  async (req: Request, res: Response) => {
    console.log(req.query, "req.query");
    const { executePaymentResult, redirectUrl } =
      await AppointmentService.bookAppointmentCallback(req.query);

    console.log(executePaymentResult, "executePaymentResult");
    res.redirect(redirectUrl);
    // sendResponse(res, {
    //   statusCode: httpStatus.OK,
    //   success: true,
    //   message: "Appointment Booked Successfully",
    //   data: result,
    // });
  },
);

export const AppointmentController = {
  bookAppointment,
  bookAppointmentCallback,
};
