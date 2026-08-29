import z from "zod";

const patientRegistrationZodSchema = z.object({
  name: z
    .string()
    .min(3, "Name is too short it must be atleast 3 character log")
    .max(30),
  email: z.email(),
  password: z
    .string()
    .min(8, "Minimum 8 Characters long")
    .regex(/[A-Z]/, "Must contain one Upercase and")
    .regex(/[a-z]/, "one lowercase alphabet and")
    .regex(/[0-9]/, "Also one digit and")
    .regex(/[^A-Za-z0-9]/, "one special Character"),
  patient: z
    .object({
      contactNumber: z.string().optional(),
    })
    .optional(),
});

export const PatientValidation = {
    patientRegistrationZodSchema
}