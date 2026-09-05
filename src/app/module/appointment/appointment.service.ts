import { Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync";
import config from "../../config";
import { getBkashIdToken } from "../../lib/bkash";
import { success } from "zod";

const bookAppointment = async () => {
  const bkashIdToken = await getBkashIdToken();
  if (!bkashIdToken) {
    throw new Error("Failed to get bKash ID token");
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
        payerReference: "01770618575",
        callbackURL: `${config.bkash_callback_url}/appointment/book-appointment/payment/callback`,
        amount: "1500",
        currency: "BDT",
        intent: "sale",
        merchantInvoiceNumber: "INV18756",
      }),
    },
  );

  const bkashCreatePaymentResult = await bkashCreatePaymentResponse.json();
  return bkashCreatePaymentResult;
};

const bookAppointmentCallback = async (query: Record<string, any>) => {
  const paymentId = query.paymentID;

  if (!paymentId) {
    throw new Error("Payment ID is missing");
  }

  const status = query.status;

  if (!status) {
    throw new Error("Payment Status is missing");
  }

  const bkashIdToken = await getBkashIdToken();

  if (!bkashIdToken) {
    throw new Error("Failed to get bKash ID token");
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
    return {
      executePaymentResult,
      redirectUrl: `${config.frontend_url}/dashboard/my-appointments?status=success`,
    };
  }

  if (status === "failure") {
    return {
      executePaymentResult,
      redirectUrl: `${config.frontend_url}/dashboard/my-appointments?status=failure`,
    };
  }
  
  if (status === "cancel") {
    return {
      executePaymentResult,
      redirectUrl: `${config.frontend_url}/dashboard/my-appointments?status=cancel`,
    };
  }

  return {
    executePaymentResult,
    redirectUrl: `${config.frontend_url}/dashboard/my-appointments`,
  };
};

export const AppointmentService = { bookAppointment, bookAppointmentCallback };
