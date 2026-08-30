import { Role } from "../../generated/prisma/enums";
import config from "../config";
import { prisma } from "../lib/prisma";
import bcrypt from "bcryptjs";

//create super admin
export const seedSuperAdmin = async () => {
  try {
    const isSuperAdmiExist = await prisma.user.findFirst({
      where: {
        role: Role.SUPER_ADMIN,
      },
    });

    if (isSuperAdmiExist) {
      console.log("SUpper Admin Already Exist!");
      return;
    }

    const name = config.super_admin_name;
    const email = config.super_admin_email;
    const password = config.super_admin_password;

    if (!name || !email || !password) {
      throw new Error(
        "Super Admin Name, Email, Password Missing in Env  File!!",
      );
    }

    const hashedPassword = await bcrypt.hash(
      password,
      Number(config.bcrypt_salt_rounds),
    );

    const superAdmin = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: Role.SUPER_ADMIN,
        needPasswordChange: false,
        emailVerified: true,
      },
    });
    console.log("Supper Admin Created : ", superAdmin);
  } catch (error) {
    console.log("Error Seding Super admin: ", error);
    await prisma.user.delete({
      where: {
        email: config.super_admin_email,
      },
    });
  }
};

//create tester admin
export const seedTesterAdmin = async () => {
  try {
    const isTesterAdminExist = await prisma.user.findUnique({
      where: {
        email: config.tester_admin_email,
      },
    });

    if (isTesterAdminExist) {
      console.log("Tester Admin Already Exist!");
      return;
    }

    const name = config.tester_admin_name;
    const email = config.tester_admin_email;
    const password = config.tester_admin_password;

    if (!name || !email || !password) {
      throw new Error(
        "Tester Admin Name, Email, Password Missing in Env  File!!",
      );
    }

    const hashedPassword = await bcrypt.hash(
      password,
      Number(config.bcrypt_salt_rounds),
    );

    const testerAdmin = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: Role.ADMIN,
        needPasswordChange: false,
        emailVerified: true,
      },
    });
    console.log("Tester Admin Created : ", testerAdmin);
  } catch (error) {
    console.log("Error Seding Tester admin: ", error);
    await prisma.user.delete({
      where: {
        email: config.tester_admin_email,
      },
    });
  }
};

//create tester doctor
export const seedTesterDoctor = async () => {
  try {
    const isTesterDoctorExist = await prisma.user.findUnique({
      where: {
        email: config.tester_doctor_email,
      },
    });

    if (isTesterDoctorExist) {
      console.log("Tester Doctor Already Exist!");
      return;
    }

    const name = config.tester_doctor_name;
    const email = config.tester_doctor_email;
    const password = config.tester_doctor_password;

    if (!name || !email || !password) {
      throw new Error(
        "Tester Doctor Name, Email, Password Missing in Env  File!!",
      );
    }

    const hashedPassword = await bcrypt.hash(
      password,
      Number(config.bcrypt_salt_rounds),
    );

    const testerDoctor = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: Role.DOCTOR,
        needPasswordChange: false,
        emailVerified: true,
      },
    });
    console.log("Tester Doctor Created : ", testerDoctor);
  } catch (error) {
    console.log("Error Seding Tester Doctor: ", error);
    await prisma.user.delete({
      where: {
        email: config.tester_doctor_email,
      },
    });
  }
};
