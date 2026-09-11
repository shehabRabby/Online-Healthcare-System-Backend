import { UploadApiResponse } from "cloudinary";
import httpStatus from "http-status";
import PDFDocument from "pdfkit";
import { AppointmentStatus, Role } from "../../../generated/prisma/enums";
import config from "../../config";
import { cloudinary } from "../../lib/cloudinary";
import { transporter } from "../../lib/nodemailer";
import { prisma } from "../../lib/prisma";
import { RequestUser } from "../../middleware/checkAuth";
import { AppError } from "../../utils/AppError";
import { ICreatePrescriptionPayload } from "./prescription.interface";

const createPrescription = async (
  payload: ICreatePrescriptionPayload,
  user: RequestUser,
) => {
  const doctor = await prisma.doctor.findUnique({
    where: { userId: user.userId },
  });

  if (!doctor) {
    throw new AppError(httpStatus.NOT_FOUND, "Doctor Profile Not Found");
  }

  const appointment = await prisma.appointment.findUnique({
    where: { id: payload.appointmentId, doctorId: doctor.id },
    include: { patient: true },
  });

  if (!appointment) {
    throw new AppError(httpStatus.NOT_FOUND, "Appointment Not Found");
  }

  if (appointment.status !== AppointmentStatus.COMPLETED) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Prescription Can Only Be Written For A Completed Appointment",
    );
  }

  if (appointment.prescriptionUrl) {
    throw new AppError(
      httpStatus.CONFLICT,
      "A Prescription Already Exists For This Appointment",
    );
  }

  //start

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

  // COLORS

  const primaryColor = "#167D9A";
  const lightPrimary = "#EAF6F8";
  const darkColor = "#263238";
  const mutedColor = "#607D8B";
  const borderColor = "#D9E5E8";
  const medicineBg = "#F7FBFC";

  //HEADER

  // Top medical color bar
  pdfDocument.rect(0, 0, pdfDocument.page.width, 12).fill(primaryColor);

  // System name
  pdfDocument
    .fillColor(primaryColor)
    .font("Helvetica-Bold")
    .fontSize(22)
    .text("PH Healthcare System", {
      align: "center",
    });

  pdfDocument.moveDown(0.3);

  // Prescription title
  pdfDocument
    .fillColor(darkColor)
    .font("Helvetica-Bold")
    .fontSize(15)
    .text("MEDICAL PRESCRIPTION", {
      align: "center",
      characterSpacing: 0.5,
    });

  pdfDocument.moveDown(1.5);

  // PATIENT / DOCTOR INFO

  const infoY = pdfDocument.y;

  pdfDocument.roundedRect(50, infoY, 495, 110, 7).fill(lightPrimary);

  pdfDocument
    .fillColor(primaryColor)
    .font("Helvetica-Bold")
    .fontSize(10)
    .text("PATIENT INFORMATION", 65, infoY + 12);

  pdfDocument
    .fillColor(darkColor)
    .font("Helvetica-Bold")
    .fontSize(11)
    .text(`${appointment.patient.name}`, 65, infoY + 32);

  pdfDocument
    .fillColor(mutedColor)
    .font("Helvetica")
    .fontSize(9.5)
    .text("Patient", 65, infoY + 48);

  pdfDocument
    .fillColor(primaryColor)
    .font("Helvetica-Bold")
    .fontSize(10)
    .text("DOCTOR INFORMATION", 300, infoY + 12);

  pdfDocument
    .fillColor(darkColor)
    .font("Helvetica-Bold")
    .fontSize(11)
    .text(`${doctor.name}`, 300, infoY + 32);

  pdfDocument
    .fillColor(mutedColor)
    .font("Helvetica")
    .fontSize(9.5)
    .text(`${doctor.specialization}`, 300, infoY + 48);

  pdfDocument
    .fillColor(mutedColor)
    .font("Helvetica")
    .fontSize(9)
    .text("Prescription Date", 65, infoY + 75);

  pdfDocument
    .fillColor(darkColor)
    .font("Helvetica-Bold")
    .fontSize(9.5)
    .text(`${new Date().toDateString()}`, 170, infoY + 75);

  pdfDocument.y = infoY + 130;

  //FINDINGS

  pdfDocument
    .fillColor(primaryColor)
    .font("Helvetica-Bold")
    .fontSize(12)
    .text("CLINICAL FINDINGS");

  pdfDocument.moveDown(0.5);

  // Findings box
  const findingsY = pdfDocument.y;

  pdfDocument.roundedRect(50, findingsY, 495, 65, 6).fill("#F8FBFC");

  pdfDocument.rect(50, findingsY, 4, 65).fill(primaryColor);

  pdfDocument
    .fillColor(darkColor)
    .font("Helvetica")
    .fontSize(10)
    .text(payload.findings, 68, findingsY + 13, {
      width: 460,
      lineGap: 3,
    });

  pdfDocument.y = findingsY + 82;

  // MEDICINES

  pdfDocument
    .fillColor(primaryColor)
    .font("Helvetica-Bold")
    .fontSize(12)
    .text("PRESCRIBED MEDICINES");

  pdfDocument.moveDown(0.7);

  for (let i = 0; i < payload.medicines.length; i++) {
    const medicine = payload.medicines[i];

    const medicineY = pdfDocument.y;

    // Medicine card

    pdfDocument
      .roundedRect(50, medicineY, 495, medicine.instructions ? 105 : 82, 6)
      .fill(medicineBg);

    // Medicine number circle
    pdfDocument.circle(75, medicineY + 22, 12).fill(primaryColor);

    pdfDocument
      .fillColor("#FFFFFF")
      .font("Helvetica-Bold")
      .fontSize(9)
      .text(`${i + 1}`, 69, medicineY + 17, {
        width: 12,
        align: "center",
      });

    // Medicine name
    pdfDocument
      .fillColor(darkColor)
      .font("Helvetica-Bold")
      .fontSize(11)
      .text(medicine.name, 100, medicineY + 12, {
        width: 420,
      });

    // Divider
    pdfDocument
      .moveTo(100, medicineY + 34)
      .lineTo(525, medicineY + 34)
      .strokeColor(borderColor)
      .lineWidth(0.7)
      .stroke();

    // Dosage
    pdfDocument
      .fillColor(mutedColor)
      .font("Helvetica")
      .fontSize(9)
      .text("Dosage", 100, medicineY + 45);

    pdfDocument
      .fillColor(darkColor)
      .font("Helvetica-Bold")
      .fontSize(9)
      .text(`${medicine.dosage}`, 165, medicineY + 45, {
        width: 150,
      });

    // Duration
    pdfDocument
      .fillColor(mutedColor)
      .font("Helvetica")
      .fontSize(9)
      .text("Duration", 330, medicineY + 45);

    pdfDocument
      .fillColor(darkColor)
      .font("Helvetica-Bold")
      .fontSize(9)
      .text(`${medicine.duration}`, 395, medicineY + 45, {
        width: 125,
      });

    // Instructions
    if (medicine.instructions) {
      pdfDocument
        .fillColor(mutedColor)
        .font("Helvetica")
        .fontSize(9)
        .text("Instructions", 100, medicineY + 65);

      pdfDocument
        .fillColor(darkColor)
        .font("Helvetica")
        .fontSize(9)
        .text(`${medicine.instructions}`, 165, medicineY + 65, {
          width: 350,
          lineGap: 2,
        });
    }

    pdfDocument.y = medicineY + (medicine.instructions ? 118 : 95);
  }

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
    .text("PH Healthcare System", {
      align: "center",
    });

  pdfDocument.moveDown(0.25);

  pdfDocument
    .fillColor(mutedColor)
    .font("Helvetica")
    .fontSize(8.5)
    .text(
      "This prescription is digitally generated for your healthcare appointment.",
      {
        align: "center",
      },
    );

  pdfDocument.moveDown(0.4);

  pdfDocument
    .fillColor("#90A4AE")
    .fontSize(8)
    .text("Please follow your doctor's instructions carefully.", {
      align: "center",
    });

  pdfDocument.end();

  const pdfBuffer = await pdfReadyPromise;

  // end

  const uploadResult = await new Promise<UploadApiResponse>(
    (resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          { resource_type: "raw", format: "pdf" },
          (error, result) => {
            if (error) {
              return reject(error);
            }

            if (!result) {
              return reject(
                new AppError(
                  httpStatus.INTERNAL_SERVER_ERROR,
                  "No Result Returned From Cloudinary",
                ),
              );
            }

            resolve(result);
          },
        )
        .end(pdfBuffer);
    },
  );

  const updatedAppointment = await prisma.appointment.update({
    where: { id: appointment.id },
    data: {
      prescriptionUrl: uploadResult.secure_url,
      prescriptionPublicId: uploadResult.public_id,
    },
  });

  await transporter.sendMail({
    from: config.email_sender,
    to: appointment.patient.email,
    subject: "Your Prescription - PH Healthcare System",
    text: "Please find your prescription attached.",
    attachments: [
      {
        filename: "prescription.pdf",
        content: pdfBuffer,
      },
    ],
  });

  return updatedAppointment;
};

const getSinglePrescription = async (
  appointmentId: string,
  user: RequestUser,
) => {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      patient: { select: { id: true, name: true, userId: true } },
      doctor: { select: { id: true, name: true, userId: true } },
    },
  });

  if (!appointment) {
    throw new AppError(httpStatus.NOT_FOUND, "Appointment Not Found");
  }

  if (user.role === Role.PATIENT) {
    if (appointment.patient.userId !== user.userId) {
      throw new AppError(
        httpStatus.FORBIDDEN,
        "You Are Not Allowed To View This Appointment",
      );
    }
  }
  if (user.role === Role.DOCTOR) {
    if (appointment.doctor.userId !== user.userId) {
      throw new AppError(
        httpStatus.FORBIDDEN,
        "You Are Not Allowed To View This Appointment",
      );
    }
  }

  if (!appointment.prescriptionUrl) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      "No Prescription Has Been Written Yet",
    );
  }

  return {
    appointment,
    prescription: appointment.prescriptionUrl,
  };
};

export const PrescriptionServices = {
  createPrescription,
  getSinglePrescription,
};
