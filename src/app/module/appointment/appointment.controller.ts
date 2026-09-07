import { Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import httpStatus from "http-status";
import { AppointmentService } from "./appointment.service";

const bookAppointment = catchAsync(async (req: Request, res: Response) => {
  const payload = req.body;
  const user = req.user!;
  const result = await AppointmentService.bookAppointment(payload, user);

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Appointment Payment Initiated Successfully",
    data: result,
  });
});

const payAppointment = catchAsync(async (req: Request, res: Response) => {
  const payload = req.body;
  const user = req.user!;
  const result = await AppointmentService.payAppointment(payload, user);

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Appointment Payment Initiated Successfully",
    data: result,
  });
});

const bookAppointmentCallback = catchAsync(
  async (req: Request, res: Response) => {
    const { redirectUrl } = await AppointmentService.bookAppointmentCallback(
      req.query,
    );

    res.redirect(redirectUrl);
    // sendResponse(res, {
    //   statusCode: httpStatus.OK,
    //   success: true,
    //   message: "Appointment Booked Successfully",
    //   data: result,
    // });
  },
);

const cancelAppointment = catchAsync(async (req: Request, res: Response) => {
  const payload = req.body;
 
  const result = await AppointmentService.cancleAppointment(payload);

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Appointment Payment Cancelled And Refunded Successfully",
    data: result,
  });
});


export const AppointmentController = {
  bookAppointment,
  bookAppointmentCallback,
  payAppointment,
  cancelAppointment
};
