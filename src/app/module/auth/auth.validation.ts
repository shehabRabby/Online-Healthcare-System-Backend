import z, { email } from "zod";

const patientRegistrationZodSchema = z.object({
  name: z
    .string()
    .min(3, "Name is too short it must be atleast 3 character log")
    .max(30),
  email: z.email(),
  password: z
    .string()
    .min(8, "Password must contain Minimum 8 Characters long")
    .regex(/[A-Z]/, "Password must contain one Upercase letter")
    .regex(/[a-z]/, "Password must contain one lowercase letter")
    .regex(/[0-9]/, "Password must contain one digit")
    .regex(/[^A-Za-z0-9]/, "Password must contain one special Character"),
  patient: z
    .object({
      contactNumber: z.string().optional(),
    })
    .optional(),
});

const LoginZodSchema = z.object({
  email: z.email(),
  password: z
    .string()
    .min(8, "Password must contain Minimum 8 Characters long")
    .regex(/[A-Z]/, "Password must contain one Upercase letter")
    .regex(/[a-z]/, "Password must contain one lowercase letter")
    .regex(/[0-9]/, "Password must contain one digit")
    .regex(/[^A-Za-z0-9]/, "Password must contain one special Character"),
});

export const UserValidation = {
  patientRegistrationZodSchema,LoginZodSchema
};
