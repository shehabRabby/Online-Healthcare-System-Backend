import { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync";
import { AppError } from "../../utils/AppError";
import config from "../../config";
import { getBkashIdToken } from "../../lib/bkash";
import { success } from "zod";
import { prisma } from "../../lib/prisma";
import {
  AppointmentStatus,
  PaymentStatus,
} from "../../../generated/prisma/enums";
import { RequestUser } from "../../middleware/checkAuth";
import { error } from "node:console";
import { exitCode } from "node:process";
import crypto from "crypto";

const bookAppointment = async (payload: any, user: RequestUser) => {
  const transactionResult = await prisma.$transaction(async (tx) => {
    //appointment creation
    const appointment = await tx.appointment.create({
      data: {
        status: AppointmentStatus.PENDING,
      },
    });

    const bkashIdToken = await getBkashIdToken();

    if (!bkashIdToken) {
      throw new AppError(httpStatus.INTERNAL_SERVER_ERROR, "Failed to get bKash ID token");
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
          amount: "1500",
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
        amount: "1500",
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

const payAppointment = async (payload: any, user: RequestUser) => {
  const appointmentId = payload.appointmentId;

  const existingAppointment = await prisma.appointment.findUnique({
    where: {
      id: appointmentId,
    },
  });

  if (!existingAppointment) {
    throw new AppError(httpStatus.NOT_FOUND, "Appointment not found");
  }

  if (existingAppointment.status !== "PENDING") {
    throw new AppError(httpStatus.BAD_REQUEST, "Appointment is not Pending");
  }

  // if (
  //   existingAppointment.status === "CANCELLED" ||
  //   existingAppointment.status === "ONGOING" ||
  //   existingAppointment.status === "COMPLETED"
  // ) {
  //   const appointmentStatus = existingAppointment.status;
  //   throw new Error(`Appointment is already ${appointmentStatus.toLowerCase}`);
  // }

  const bkashIdToken = await getBkashIdToken();

  if (!bkashIdToken) {
    throw new AppError(httpStatus.INTERNAL_SERVER_ERROR, "Failed to get bKash ID token");
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
        amount: "1500",
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
  const transactionResult = await prisma.$transaction(async (tx) => {
    const paymentId = query.paymentID;

    if (!paymentId) {
      throw new AppError(httpStatus.BAD_REQUEST, "Payment ID is missing");
    }

    const status = query.status;

    if (!status) {
      throw new AppError(httpStatus.BAD_REQUEST, "Payment Status is missing");
    }

    const bkashIdToken = await getBkashIdToken();

    if (!bkashIdToken) {
      throw new AppError(httpStatus.INTERNAL_SERVER_ERROR, "Failed to get bKash ID token");
    }

    const executePaymentResponse = await fetch(
      `${config.bkash_base_url}/tokenized/checkout/execute`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: bkashIdToken,
          "X-APP-Key": config.bkash_app_key,
        },
        body: JSON.stringify({
          paymentID: paymentId,
        }),
      },
    );

    const executePaymentResult = await executePaymentResponse.json();

    if (status === "success") {
      await tx.appointment.update({
        where: {
          id: executePaymentResult.merchantInvoiceNumber,
        },
        data: {
          status: AppointmentStatus.CONFIRMED,
        },
      });

      await tx.payment.update({
        where: {
          appointmentId: executePaymentResult.merchantInvoiceNumber,
          bkashPaymentId: paymentId,
        },
        data: {
          status: PaymentStatus.PAID,
          bkashTrxID: executePaymentResult.trxID,
          paidAt: executePaymentResult.paymentExecuteTime,
          gatewayResponse: executePaymentResult,
        },
      });

      return {
        executePaymentResult,
        redirectUrl: `${config.frontend_url}/dashboard/my-appointments?status=success`,
      };
    } else if (status === "failure") {
      await tx.payment.update({
        where: {
          bkashPaymentId: paymentId,
        },
        data: {
          status: PaymentStatus.FAILED,
          gatewayResponse: executePaymentResult,
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
          gatewayResponse: executePaymentResult,
        },
      });

      return {
        executePaymentResult,
        redirectUrl: `${config.frontend_url}/dashboard/my-appointments?status=cancel`,
      };
    } else {
      return {
        executePaymentResult,
        redirectUrl: `${config.frontend_url}/dashboard/my-appointments?error=payment_failed`,
      };
    }
  });
  return transactionResult;
};

const cancleAppointment = async (payload: any) => {
  const transactionResult = await prisma.$transaction(async (tx) => {
    const appointmentId = payload.appointmentId;

    const existingAppointment = await tx.appointment.findUnique({
      where: {
        id: appointmentId,
      },
      include: {
        payment: true,
      },
    });

    if (!existingAppointment) {
      throw new AppError(httpStatus.NOT_FOUND, "Appointment not found");
    }

    if (
      existingAppointment.status === "ONGOING" ||
      existingAppointment.status === "COMPLETED"
    ) {
      throw new AppError(httpStatus.BAD_REQUEST, "Appointment Ongoing or Completed");
    }

    if (existingAppointment.status === "CANCELLED") {
      throw new AppError(httpStatus.CONFLICT, "Appointment Already Cancelled");
    }

    const updatedAppointment = await tx.appointment.update({
      where: {
        id: existingAppointment.id,
      },
      data: {
        status: "CANCELLED",
      },
    });

    const bkashIdToken = await getBkashIdToken();

    if (!bkashIdToken) {
      throw new AppError(httpStatus.INTERNAL_SERVER_ERROR, "Failed to get bKash ID token");
    }

    const bkashRefundPaymentResponse = await fetch(
      `${config.bkash_base_url}/tokenized/checkout/payment/refund`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: bkashIdToken,
          "X-APP-Key": config.bkash_app_key,
        },
        body: JSON.stringify({
          paymentID: existingAppointment.payment?.bkashPaymentId,
          trxID: existingAppointment.payment?.bkashTrxId,
          amount: existingAppointment.payment?.amount.toString(),
          sku: "Appointment Cancellation",
          reason: "Patient Cancelled the Appointment",
        }),
      },
    );

    const bkashRefundPaymentResult = await bkashRefundPaymentResponse.json();
    console.log({ bkashRefundPaymentResult });

    const updatedPayment = await tx.payment.update({
      where: {
        appointmentId: existingAppointment.id,
      },
      data: {
        refundTrxId: bkashRefundPaymentResult.refundTrxID,
        refundAt: bkashRefundPaymentResult.completedTime,
        refundAmount: bkashRefundPaymentResult.amount,
        refundReason: "Patient Cancelled the Appointment",
        status: PaymentStatus.REUNDED,
        gatewayResponse: bkashRefundPaymentResult,
      },
    });

    return {
      appointment: updatedAppointment,
      payment: updatedPayment,
    };
  });
  return transactionResult;
};

export const AppointmentService = {
  bookAppointment,
  bookAppointmentCallback,
  payAppointment,
  cancleAppointment,
};
