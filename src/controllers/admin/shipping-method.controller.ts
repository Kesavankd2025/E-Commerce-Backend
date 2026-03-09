import { Post, Body, Req, Res, UseBefore, JsonController, Put, Param, Get, Delete } from "routing-controllers";
import { ObjectId } from "mongodb";
import { StatusCodes } from "http-status-codes";
import { AuthMiddleware, AuthPayload } from "../../middlewares/AuthMiddleware";
import { AppDataSource } from "../../data-source";
import { ShippingMethod } from "../../entity/ShippingMethod";
import { CreateShippingMethodDto, UpdateShippingMethodDto } from "../../dto/admin/shipping-method.dto";
import { handleErrorResponse, response } from "../../utils";
import { Request, Response } from "express";

interface RequestWithFiles extends Request {
    user: AuthPayload;
}

@UseBefore(AuthMiddleware)
@JsonController("/shipping-methods")
export class ShippingMethodController {
    private repo = AppDataSource.getMongoRepository(ShippingMethod);

    @Post("/save")
    async save(
        @Req() req: RequestWithFiles,
        @Body() body: CreateShippingMethodDto,
        @Res() res: Response
    ) {
        try {
            // Find if any config exists, if yes update it, else create new
            // For now, let's assume we maintain different types if they want to switch,
            // or just one global active one.
            // Let's try to find an existing one of for the same type to update it

            let doc = await this.repo.findOneBy({ type: body.type, isDelete: 0 });

            if (!doc) {
                doc = new ShippingMethod();
                doc.type = body.type;
                doc.isDelete = 0;
                doc.createdBy = new ObjectId(req.user.userId);
                doc.createdAt = new Date();
            } else {
                doc.updatedBy = new ObjectId(req.user.userId);
                doc.updatedAt = new Date();
            }

            if (body.rules !== undefined) doc.rules = body.rules;
            if (body.isActive !== undefined) doc.isActive = body.isActive;

            // If this is being saved, maybe make others inactive?
            // The user wants to select one and save.
            if (doc.isActive) {
                await this.repo.updateMany({ type: { $ne: body.type } }, { $set: { isActive: false } });
            }

            await this.repo.save(doc);
            return response(res, StatusCodes.OK, "Shipping method saved successfully", doc);
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }

    @Get("/get-active")
    async getActive(@Res() res: Response) {
        try {
            const doc = await this.repo.findOneBy({ isActive: true, isDelete: 0 });
            if (!doc) {
                return response(res, StatusCodes.OK, "No active shipping method found", null);
            }
            return response(res, StatusCodes.OK, "Fetched active shipping method", doc);
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }

    @Get("/get-all")
    async getAll(@Res() res: Response) {
        try {
            const docs = await this.repo.find({ where: { isDelete: 0 } });
            return response(res, StatusCodes.OK, "Fetched all shipping methods", docs);
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }
}
