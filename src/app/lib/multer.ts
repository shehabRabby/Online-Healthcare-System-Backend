import multer from "multer";

//setup multer for handeling file upload
const storage = multer.memoryStorage();
export const upload = multer({ storage: storage });
