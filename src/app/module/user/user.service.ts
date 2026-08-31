import { cloudinary } from "../../lib/cloudinary";
import { prisma } from "../../lib/prisma";

const uploadProfileImage = async (buffer: Buffer, userId: string) => {
  cloudinary.uploader
    .upload_stream(
      {
        resource_type: "auto",
      },
      async (error, result) => {
        if (error) {
          console.log(error);
          throw new Error(error.message);
        }
        console.log(result, "result");
        const updateUser = await prisma.user.update({
          where: {
            id: userId,
          },
          data: {
            
          },
        });
        // return result;
      },
    )
    .end(buffer);
};

export const UserServices = {
  uploadProfileImage,
};
