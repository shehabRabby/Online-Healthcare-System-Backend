import { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync";
import { AppError } from "../../utils/AppError";
import config from "../../config";
import { getBkashIdToken } from "../../lib/bkash";
import { success } from "zod";
import PDFDocument from "pdfkit";
import { prisma } from "../../lib/prisma";
import {
  AppointmentStatus,
  PaymentStatus,
  ScheduleStatus,
} from "../../../generated/prisma/enums";
import { RequestUser } from "../../middleware/checkAuth";
import { error } from "node:console";
import { exitCode } from "node:process";
import crypto from "crypto";
import {
  IBookAppointmentPayload,
  ICancelAppointmentPayload,
  IPayAppointmentPayload,
  IUpdateAppointmentStatusPayload,
} from "./appointment.interface";
import { addMinutes, isBefore, isSameDay, subHours } from "date-fns";
import { schedule } from "node-cron";
import { transporter } from "../../lib/nodemailer";

const bookAppointment = async ( payload: IBookAppointmentPayload, user: RequestUser) => {
  const transactionResult = await prisma.$transaction(async (tx) => {
    //appointment creation

    const patient = await prisma.patient.findUnique({
      where: { userId: user.userId },
    });

    if (!patient) {
      throw new AppError(httpStatus.NOT_FOUND, "Patient Profile Not Found");
    }

    const schedule = await prisma.schedule.findUnique({
      where: { id: payload.scheduleId },
      include: { doctor: true },
    });

    if (!schedule || schedule.isDeleted) {
      throw new AppError(httpStatus.NOT_FOUND, "Schedule Not Found");
    }

    if (schedule.status !== ScheduleStatus.PUBLISHED) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "This Schedule Is Not Published Yet",
      );
    }

    const now = new Date();

    if (!isSameDay(now, schedule.startDateTime)) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "This Schedule Is Not Available Today",
      );
    }

    if (!isBefore(now, schedule.startDateTime)) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "This Schedule Has Already Started",
      );
    }

    const existingAppointment = await prisma.appointment.findFirst({
      where: {
        patientId: patient.id,
        scheduleId: schedule.id,
      },
    });

    if (existingAppointment?.status === AppointmentStatus.PENDING) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "You Already Have A Pending Appointment. Please Pay For That",
      );
    }
    if (existingAppointment?.status === AppointmentStatus.CONFIRMED) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "You Already Have A Confirmed Appointment.",
      );
    }
    if (existingAppointment?.status === AppointmentStatus.ONGOING) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "You Already Have A Ongoing Appointment",
      );
    }
    if (existingAppointment?.status === AppointmentStatus.COMPLETED) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "You Already Have Completed An Appointment On This Schedule. Please Try Again Another Day",
      );
    }

    if (schedule.availableSlots === 0) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "This Schedule Is Fully Booked",
      );
    }

    if (!schedule.doctor.consultationFee) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "Doctor Has Not Set A Consultation Fee Yet",
      );
    }

    const amount = schedule.doctor.consultationFee.toString();

    const appointment = await tx.appointment.create({
      data: {
        status: AppointmentStatus.PENDING,
        patientId: patient.id,
        doctorId: schedule.doctor.id,
        scheduleId: schedule.id,
      },
    });

    const bkashIdToken = await getBkashIdToken();

    if (!bkashIdToken) {
      throw new AppError(
        httpStatus.INTERNAL_SERVER_ERROR,
        "Failed to get bKash ID token",
      );
    }

    const bkashCreatePaymentResponse = await fetch(
      `${config.bkash_base_url}/tokenized/checkout/create`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: bkashIdToken,
          "X-APP-Key": config.bkash_app_key,
        },
        body: JSON.stringify({
          mode: "0011",
          payerReference: user.email,
          callbackURL: `${config.bkash_callback_url}/appointment/book-appointment/payment/callback`,
          amount: amount,
          currency: "BDT",
          intent: "sale",
          merchantInvoiceNumber: appointment.id,
        }),
      },
    );

    const bkashCreatePaymentResult = await bkashCreatePaymentResponse.json();

    //create a payment model record in the database

    await tx.payment.create({
      data: {
        merchentInvoiceNumber: bkashCreatePaymentResult.merchantInvoiceNumber,
        appointmentId: appointment.id,
        amount: amount,
        gatewayResponse: bkashCreatePaymentResult,
        bkashPaymentId: bkashCreatePaymentResult.paymentID,
        payerReference: user.email,
      },
    });

    return {
      paymentUrl: bkashCreatePaymentResult.bkashURL,
    };
  });

  return transactionResult;
};

const payAppointment = async (payload: IPayAppointmentPayload, user: RequestUser) => {
  const appointmentId = payload.appointmentId;

  const existingAppointment = await prisma.appointment.findUnique({
    where: {
      id: appointmentId,
    },
    include: {
      schedule: {
        include: {
          doctor: true,
        },
      },
    },
  });

  if (!existingAppointment) {
    throw new AppError(httpStatus.NOT_FOUND, "Appointment not found");
  }

  if (existingAppointment.status !== "PENDING") {
    throw new AppError(httpStatus.BAD_REQUEST, "Appointment is not Pending");
  }

  if (!existingAppointment.schedule.doctor.consultationFee) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Doctor Has Not Set A Consultation Fee Yet",
    );
  }

  const amount = existingAppointment.schedule.doctor.consultationFee.toString();

  const bkashIdToken = await getBkashIdToken();

  if (!bkashIdToken) {
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      "Failed to get bKash ID token",
    );
  }

  const bkashCreatePaymentResponse = await fetch(
    `${config.bkash_base_url}/tokenized/checkout/create`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: bkashIdToken,
        "X-APP-Key": config.bkash_app_key,
      },
      body: JSON.stringify({
        mode: "0011",
        payerReference: user.email,
        callbackURL: `${config.bkash_callback_url}/appointment/book-appointment/payment/callback`,
        amount: amount,
        currency: "BDT",
        intent: "sale",
        merchantInvoiceNumber: existingAppointment.id,
      }),
    },
  );

  const bkashCreatePaymentResult = await bkashCreatePaymentResponse.json();

  await prisma.payment.update({
    where: {
      appointmentId: existingAppointment.id,
    },
    data: {
      merchentInvoiceNumber: bkashCreatePaymentResult.merchantInvoiceNumber,
      gatewayResponse: bkashCreatePaymentResult,
      bkashPaymentId: bkashCreatePaymentResult.paymentID,
    },
  });

  return {
    paymentUrl: bkashCreatePaymentResult.bkashURL,
  };
};

const bookAppointmentCallback = async (query: Record<string, any>) => {
  const transactionResult = await prisma.$transaction(
    async (tx) => {
      const paymentId = query.paymentID;

      if (!paymentId) {
        throw new AppError(httpStatus.BAD_REQUEST, "Payment Id Missing");
      }

      const status = query.status;

      if (!status) {
        throw new AppError(httpStatus.BAD_REQUEST, "Payment Status is Missing");
      }

      const bkashIdToken = await getBkashIdToken();

      if (!bkashIdToken) {
        throw new AppError(
          httpStatus.BAD_GATEWAY,
          "No Bkash Access Token Found!",
        );
      }

      const executedPaymentResponse = await fetch(
        `${config.bkash_base_url}/tokenized/checkout/execute`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: bkashIdToken,
            "X-App-Key": config.bkash_app_key,
          },

          body: JSON.stringify({
            paymentID: paymentId,
          }),
        },
      );

      const executedPaymentResult = await executedPaymentResponse.json();

      if (status === "success") {
        const appointment = await prisma.appointment.findUnique({
          where: {
            id: executedPaymentResult.merchantInvoiceNumber,
          },
          include: {
            schedule: true,
            patient: true,
            doctor: true,
          },
        });

        if (!appointment) {
          throw new AppError(httpStatus.NOT_FOUND, "Appointment Not Found!");
        }

        // total slot = 3 , available slot = 2
        // (total - available) + 1

        const alreadyBookedSlots =
          appointment.schedule.totalSlots - appointment.schedule.availableSlots;

        const serialNumber = alreadyBookedSlots + 1;

        // 25 August => 3:00 PM - 4:00 PM
        // 1st person joining time => startDateTime = 2026-08-25T15:00:00.436Z => 3:00 PM
        // serial number (1) - 1 * 20 => 0 minues

        // 2nd person joining time => startDateTime = 2026-08-25T15:20:00.436Z => 3:00 PM
        // serial number (2) - 1 * 20 => 20 minutes

        // 3nd person joining time => startDateTime = 2026-08-25T15:40:00.436Z => 3:00 PM
        // serial number (3) - 1 * 20 => 40 mintes

        const joiningTime = addMinutes(
          appointment.schedule.startDateTime,
          (serialNumber - 1) * 20,
        );

        await tx.appointment.update({
          where: {
            id: executedPaymentResult.merchantInvoiceNumber,
          },
          data: {
            status: AppointmentStatus.CONFIRMED,
            joiningTime,
            serialNumber,
          },
        });

        const newAvailableSlots = appointment.schedule.availableSlots - 1;

        await prisma.schedule.update({
          where: {
            id: appointment.schedule.id,
          },
          data: {
            availableSlots: newAvailableSlots,
          },
        });

        await tx.payment.update({
          where: {
            appointmentId: executedPaymentResult.merchantInvoiceNumber,
            bkashPaymentId: paymentId,
          },
          data: {
            status: PaymentStatus.PAID,
            bkashTrxId: executedPaymentResult.trxID,
            paidAt: executedPaymentResult.paymentExecuteTime,
            gatewayResponse: executedPaymentResult,
          },
        });

        //PDF start

        const pdfDocument = new PDFDocument({ margin: 50 });
        const pdfChunks: Buffer[] = [];

        pdfDocument.on("data", (chunk: Buffer) => {
          pdfChunks.push(chunk);
        });

        const pdfReadyPromise = new Promise<Buffer>((resolve) => {
          pdfDocument.on("end", () => {
            resolve(Buffer.concat(pdfChunks));
          });
        });

        //COLORS
        const primaryColor = "#167D9A";
        const secondaryColor = "#E8F6F8";
        const darkColor = "#263238";
        const mutedColor = "#607D8B";
        const borderColor = "#DDE7EA";
        const successColor = "#2E8B57";

        //HEADER

        // Top colored bar
        pdfDocument.rect(0, 0, pdfDocument.page.width, 12).fill(primaryColor);

        // Healthcare System Name
        pdfDocument
          .fillColor(primaryColor)
          .fontSize(22)
          .font("Helvetica-Bold")
          .text("Online Healthcare System", {
            align: "center",
          });

        pdfDocument.moveDown(0.3);

        // Invoice title
        pdfDocument
          .fillColor(darkColor)
          .fontSize(15)
          .font("Helvetica-Bold")
          .text("APPOINTMENT INVOICE", {
            align: "center",
            characterSpacing: 0.5,
          });

        pdfDocument.moveDown(1.5);

        // INVOICE INFO BAR

        const infoY = pdfDocument.y;

        pdfDocument.roundedRect(50, infoY, 495, 45, 6).fill(secondaryColor);

        pdfDocument
          .fillColor(primaryColor)
          .font("Helvetica-Bold")
          .fontSize(10)
          .text("PAYMENT RECEIPT", 65, infoY + 10);

        pdfDocument
          .fillColor(successColor)
          .font("Helvetica-Bold")
          .fontSize(10)
          .text("✓ PAID", 450, infoY + 10, {
            align: "right",
            width: 80,
          });

        pdfDocument.moveDown(3);

        // PATIENT & DOCTOR SECTION

        pdfDocument
          .fillColor(primaryColor)
          .font("Helvetica-Bold")
          .fontSize(11)
          .text("PATIENT INFORMATION");

        pdfDocument.moveDown(0.5);

        pdfDocument
          .fillColor(darkColor)
          .font("Helvetica-Bold")
          .fontSize(11)
          .text(`${appointment.patient?.name}`);

        pdfDocument
          .fillColor(mutedColor)
          .font("Helvetica")
          .fontSize(9.5)
          .text(`${appointment.patient?.email}`);

        pdfDocument.moveDown(1);

        pdfDocument
          .fillColor(primaryColor)
          .font("Helvetica-Bold")
          .fontSize(11)
          .text("DOCTOR INFORMATION");

        pdfDocument.moveDown(0.5);

        pdfDocument
          .fillColor(darkColor)
          .font("Helvetica-Bold")
          .fontSize(11)
          .text(`${appointment.doctor?.name}`);

        pdfDocument
          .fillColor(mutedColor)
          .font("Helvetica")
          .fontSize(9.5)
          .text(`Specialization: ${appointment.doctor?.specialization}`);

        pdfDocument.moveDown(1.5);

        // APPOINTMENT DETAILS

        pdfDocument
          .fillColor(primaryColor)
          .font("Helvetica-Bold")
          .fontSize(11)
          .text("APPOINTMENT DETAILS");

        pdfDocument.moveDown(0.6);

        const appointmentStartY = pdfDocument.y;

        const appointmentRows = [
          [
            "Appointment Date",
            appointment.schedule.startDateTime.toDateString(),
          ],
          ["Joining Time", joiningTime.toString()],
          ["Serial Number", `${serialNumber}`],
          ["Meeting Link", appointment.schedule.meetingLink],
        ];

        appointmentRows.forEach(([label, value], index) => {
          const rowY = appointmentStartY + index * 32;

          // alternating subtle background
          if (index % 2 === 0) {
            pdfDocument.rect(50, rowY - 4, 495, 28).fill("#F8FBFC");
          }

          pdfDocument
            .fillColor(mutedColor)
            .font("Helvetica")
            .fontSize(9.5)
            .text(label, 65, rowY + 4, {
              width: 135,
            });

          pdfDocument
            .fillColor(darkColor)
            .font("Helvetica-Bold")
            .fontSize(9.5)
            .text(value, 205, rowY + 4, {
              width: 325,
            });
        });

        pdfDocument.y = appointmentStartY + appointmentRows.length * 32 + 15;

        //PAYMENT DETAILS

        pdfDocument
          .fillColor(primaryColor)
          .font("Helvetica-Bold")
          .fontSize(11)
          .text("PAYMENT DETAILS");

        pdfDocument.moveDown(0.6);

        const paymentStartY = pdfDocument.y;

        const paymentRows = [
          ["Payment Method", "bKash"],
          ["Transaction ID", executedPaymentResult.trxID],
          ["Paid At", executedPaymentResult.paymentExecuteTime],
        ];

        paymentRows.forEach(([label, value], index) => {
          const rowY = paymentStartY + index * 32;

          if (index % 2 === 0) {
            pdfDocument.rect(50, rowY - 4, 495, 28).fill("#F8FBFC");
          }

          pdfDocument
            .fillColor(mutedColor)
            .font("Helvetica")
            .fontSize(9.5)
            .text(label, 65, rowY + 4, {
              width: 135,
            });

          pdfDocument
            .fillColor(darkColor)
            .font("Helvetica-Bold")
            .fontSize(9.5)
            .text(value, 205, rowY + 4, {
              width: 325,
            });
        });

        pdfDocument.y = paymentStartY + paymentRows.length * 32 + 20;

        // TOTAL AMOUNT
        const totalY = pdfDocument.y;

        pdfDocument.roundedRect(50, totalY, 495, 58, 7).fill(primaryColor);

        pdfDocument
          .fillColor("#FFFFFF")
          .font("Helvetica-Bold")
          .fontSize(11)
          .text("TOTAL AMOUNT PAID", 70, totalY + 15);

        pdfDocument
          .fillColor("#FFFFFF")
          .font("Helvetica-Bold")
          .fontSize(17)
          .text(`${executedPaymentResult.amount} BDT`, 350, totalY + 12, {
            width: 175,
            align: "right",
          });

        pdfDocument.moveDown(4);

        //FOOTER
        pdfDocument
          .moveTo(50, pdfDocument.y)
          .lineTo(545, pdfDocument.y)
          .strokeColor(borderColor)
          .lineWidth(1)
          .stroke();

        pdfDocument.moveDown(0.8);

        pdfDocument
          .fillColor(primaryColor)
          .font("Helvetica-Bold")
          .fontSize(10)
          .text("Thank you for choosing Online Healthcare System.", {
            align: "center",
          });

        pdfDocument.moveDown(0.3);

        pdfDocument
          .fillColor(mutedColor)
          .font("Helvetica")
          .fontSize(8.5)
          .text("This invoice confirms your appointment and payment.", {
            align: "center",
          });

        pdfDocument.moveDown(0.5);

        pdfDocument
          .fillColor("#90A4AE")
          .fontSize(8)
          .text("Online Healthcare System • Digital Appointment Invoice", {
            align: "center",
          });

        pdfDocument.end();

        const pdfBuffer = await pdfReadyPromise;

        await transporter.sendMail({
          from: config.email_sender,
          to: appointment.patient.email,
          subject: "Your Appointment Invoice - Online Healthcare System",
          text: "Thank you for booking an appointment. Please find your invoice attached.",
          attachments: [
            {
              filename: "invoice.pdf",
              content: pdfBuffer,
            },
          ],
        });

        //END pdf

        return {
          redirectUrl: `${config.frontend_url}/dashboard/my-appointments?status=success`,
        };
      } else if (status === "failure") {
        await tx.payment.update({
          where: {
            bkashPaymentId: paymentId,
          },
          data: {
            status: PaymentStatus.FAILED,
            gatewayResponse: executedPaymentResult,
          },
        });
        return {
          redirectUrl: `${config.frontend_url}/dashboard/my-appointments?status=failure`,
        };
      } else if (status === "cancel") {
        await tx.payment.update({
          where: {
            bkashPaymentId: paymentId,
          },
          data: {
            status: PaymentStatus.CANCELED,
            gatewayResponse: executedPaymentResult,
          },
        });
        return {
          executedPaymentResult,
          redirectUrl: `${config.frontend_url}/dashboard/my-appointments?status=cancel`,
        };
      } else {
        return {
          executedPaymentResult,
          redirectUrl: `${config.frontend_url}/dashboard/my-appointments?error=payment-failed`,
        };
      }
    },
    {
      maxWait: 10000, // default: 2000
      timeout: 30000, // default: 5000
    },
  );

  return transactionResult;
};

const cancelAppointment = async ( payload: ICancelAppointmentPayload, user: RequestUser) => {
  const transactionResult = await prisma.$transaction(async (tx) => {
    const appointmentId = payload.appointmentId;

    const existingAppointment = await tx.appointment.findUnique({
      where: {
        id: appointmentId,
        patient: {
          email: user.email,
        },
      },
      include: {
        payment: true,
        schedule: true,
      },
    });

    if (!existingAppointment) {
      throw new AppError(httpStatus.NOT_FOUND, "Appointment Does Not Exists");
    }

    if (
      existingAppointment.status === "ONGOING" ||
      existingAppointment.status === "COMPLETED"
    ) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "Appointment Ongoing or Completed",
      );
    }

    if (existingAppointment.status === "CANCELLED") {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "Appointment Already Cancelled",
      );
    }

    const updatedAppointment = await tx.appointment.update({
      where: {
        id: existingAppointment.id,
      },
      data: {
        status: AppointmentStatus.CANCELLED,
      },
    });

    await prisma.schedule.update({
      where: {
        id: existingAppointment.schedule.id,
      },
      data: {
        availableSlots: { increment: 1 },
      },
    });

    // refund process start here
    const now = new Date();
    const startDateTime = existingAppointment.schedule.startDateTime; // 25 August : 3:00 PM

    // After 2:00 Pm => no refund
    // must cancel before  2:00 PM
    const refundCutOffTime = subHours(startDateTime, 1);

    // now >  refundCutOff Time => no refund
    // now < refundCutOff Time => refund eligible
    const isEligibleForRefund = isBefore(now, refundCutOffTime);

    if (isEligibleForRefund) {
      const bkashIdToken = await getBkashIdToken();

      if (!bkashIdToken) {
        throw new AppError(
          httpStatus.BAD_GATEWAY,
          "No Bkash Access Token Found!",
        );
      }

      const bkashRefundPaymentResponse = await fetch(
        `${config.bkash_base_url}/tokenized/checkout/payment/refund`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: bkashIdToken,
            "X-App-Key": config.bkash_app_key,
          },
          body: JSON.stringify({
            paymentID: existingAppointment.payment?.bkashPaymentId,
            trxID: existingAppointment.payment?.bkashTrxId,
            amount: existingAppointment.payment?.amount.toString(),
            sku: "Appointment Cancellation",
            reason: "Patient Cancelled The Appointment",
          }),
        },
      );

      const bkashRefundPaymentResult = await bkashRefundPaymentResponse.json();

      await tx.payment.update({
        where: {
          appointmentId: existingAppointment.id,
        },
        data: {
          refundTrxId: bkashRefundPaymentResult.refundTrxID,
          refundedAt: bkashRefundPaymentResult.completedTime,
          refundAmount: bkashRefundPaymentResult.amount,
          refundReason: "Patient Cancelled The Appointment",
          status: PaymentStatus.REFUNDED,
          gatewayResponse: bkashRefundPaymentResult,
        },
      });
    }

    const newPaymentInfo = await prisma.payment.findUnique({
      where: {
        appointmentId: existingAppointment.id,
      },
    });

    return {
      appointment: updatedAppointment,
      payment: newPaymentInfo,
    };
  });

  return transactionResult;
};


//just for doctor role confirm -> ongoing -> completed
const updateAppointmentStatus = async ( appointmentId : string, payload : IUpdateAppointmentStatusPayload, user : RequestUser) => {
	const doctor = await prisma.doctor.findUnique({
		where: { userId: user.userId },
	});

	if (!doctor) {
		throw new AppError(httpStatus.NOT_FOUND, "Doctor Profile Not Found");
	}

	const appointment = await prisma.appointment.findUnique({
		where: { id: appointmentId, doctorId : doctor.id },
	});

	if (!appointment) {
		throw new AppError(httpStatus.NOT_FOUND, "Appointment Not Found");
	}

	if(appointment.status === AppointmentStatus.COMPLETED){
		throw new AppError(httpStatus.FORBIDDEN, "Appointment is already completed")
	}

	if(appointment.status === AppointmentStatus.CANCELLED){
		throw new AppError(httpStatus.FORBIDDEN, "Appointment is already cancelled")
	}
	if(appointment.status === AppointmentStatus.PENDING){
		throw new AppError(httpStatus.FORBIDDEN, "Appointment is Pending. You can change the status after appointment is confirmed")
	}

	if(appointment.status === AppointmentStatus.CONFIRMED){

		if(payload.status !== "ONGOING"){
			throw new AppError(httpStatus.BAD_REQUEST, "Confirmed Appointment Must Be Ongoing At First")
		}

		await prisma.appointment.update({
			where : {
				id : appointment.id
			},
			data : {
				status : AppointmentStatus.ONGOING
			}
		})
	}

	if(appointment.status === AppointmentStatus.ONGOING){

		if(payload.status !== "COMPLETED"){
			throw new AppError(httpStatus.BAD_REQUEST, "Ongoinf Appointment Must Be Complted.")
		}

		await prisma.appointment.update({
			where: {
				id: appointment.id
			},
			data: {
				status: AppointmentStatus.COMPLETED
			}
		})
	}

	const updatedAppointment = await prisma.appointment.findUnique({
		where : {
			id : appointment.id
		}
	})

	return updatedAppointment
}

export const AppointmentService = {
  bookAppointment,
  bookAppointmentCallback,
  payAppointment,
  cancelAppointment,
  updateAppointmentStatus
};
