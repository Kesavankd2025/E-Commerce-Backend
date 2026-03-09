import {
    JsonController,
    Post,
    Delete,
    Get,
    Req,
    Res,
    QueryParam
} from "routing-controllers";
import { Response } from "express";
import { StatusCodes } from "http-status-codes";
import * as fs from "fs";
import * as path from "path";
import { response } from "../../utils";
import imageService from "../../utils/upload";

interface RequestWithFiles extends Request {
    query: any;
    files: any;
}

@JsonController("/image")
export class ImageController {

    @Post("/upload")
    async upload(@Req() req: RequestWithFiles, @Res() res: Response) {
        try {
            if (!req.files || !req.files.file) {
                return response(res, StatusCodes.BAD_REQUEST, "No image uploaded");
            }

            if (!req.query.path) {
                return response(res, StatusCodes.BAD_REQUEST, "Path is required!!");
            }

            const file = req.files.file;

            const originalName = file.name;

            const extension = await imageService.validateImageFile(file);

            const fileName = `image_${Date.now()}${extension}`;

            const uploadResult = await imageService.fileUpload(
                file,
                req.query.path,
                fileName,
                ""
            );

            if (!uploadResult) {
                return response(res, StatusCodes.INTERNAL_SERVER_ERROR, "Upload failed");
            }

            return response(res, StatusCodes.CREATED, "Image uploaded successfully", {
                originalName,
                fileName,
                path: `${req.query.path}/${fileName}`
            });

        } catch (error: any) {
            return response(
                res,
                StatusCodes.BAD_REQUEST,
                error.message || "File upload error"
            );
        }
    }


    // ---------------------------
    // PREVIEW IMAGE
    // GET /image/view/:fileName
    // ---------------------------
    @Get("/view")
async view(
    @QueryParam("path") filePath: string,
    @Res() res: Response
) {
    if (!filePath) {
        res.status(StatusCodes.BAD_REQUEST).json({
            success: false,
            message: "Path is required"
        });
        return;
    }

    const imgPath = path.join(process.cwd(), "public", filePath);

    if (!fs.existsSync(imgPath)) {
        res.status(StatusCodes.NOT_FOUND).json({
            success: false,
            message: "Image not found"
        });
        return;
    }

    res.sendFile(imgPath);
}



    // ---------------------------
    // DELETE IMAGE
    // ---------------------------
    @Delete("/delete")
    async delete(@QueryParam("path") filePath: string, @Res() res: Response) {
        try {
            if (!filePath) {
                return response(res, StatusCodes.BAD_REQUEST, "Path is required");
            }
            const imgPath = path.join(process.cwd(), "public", filePath);

            if (!fs.existsSync(imgPath)) {
                return response(res, StatusCodes.NOT_FOUND, "File not found");
            }

            fs.unlinkSync(imgPath);

            return response(res, StatusCodes.OK, "File deleted successfully");

        } catch (error) {
            return response(
                res,
                StatusCodes.INTERNAL_SERVER_ERROR,
                error.message
            );
        }
    }
}
