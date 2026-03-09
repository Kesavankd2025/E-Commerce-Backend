import { JsonController, Get, Post, Body, Req, Res, UseBefore, Put, Param, Delete } from "routing-controllers";
import { Response } from "express";
import { StatusCodes } from "http-status-codes";
import { ObjectId } from "mongodb";
import { AppDataSource } from "../../data-source";
import { Address } from "../../entity/Address";
import { AuthMiddleware } from "../../middlewares/AuthMiddleware";
import { response, handleErrorResponse } from "../../utils";

@JsonController("/address")
@UseBefore(AuthMiddleware)
export class WebsiteAddressController {
    private repo = AppDataSource.getMongoRepository(Address);

    @Post("/add")
    async addAddress(@Req() req: any, @Body() body: any, @Res() res: Response) {
        try {
            const { name, phone, doorNo, street, city, state, pincode, label, isDefault } = body;
            const userId = new ObjectId(req.user.userId);

            // If this is set as default, unset other addresses for this user
            if (isDefault) {
                await this.repo.updateMany(
                    { userId, isDelete: 0 },
                    { $set: { isDefault: false } }
                );
            }

            const address = new Address();
            address.userId = userId;
            address.name = name;
            address.phone = phone;
            address.doorNo = doorNo;
            address.street = street;
            address.city = city;
            address.state = state;
            address.pincode = pincode;
            address.label = label || "Home";
            address.isDefault = isDefault || false;
            address.isActive = 1;
            address.isDelete = 0;

            await this.repo.save(address);

            return response(res, StatusCodes.CREATED, "Address added successfully", address);
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }

    @Get("/list")
    async listAddresses(@Req() req: any, @Res() res: Response) {
        try {
            const userId = new ObjectId(req.user.userId);
            const addresses = await this.repo.find({
                where: { userId, isDelete: 0 },
                order: { createdAt: "DESC" }
            });

            return response(res, StatusCodes.OK, "Addresses fetched successfully", addresses);
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }

    @Put("/update/:id")
    async updateAddress(@Req() req: any, @Param("id") id: string, @Body() body: any, @Res() res: Response) {
        try {
            if (!ObjectId.isValid(id)) return response(res, StatusCodes.BAD_REQUEST, "Invalid ID");
            const userId = new ObjectId(req.user.userId);
            const address = await this.repo.findOneBy({ _id: new ObjectId(id), userId, isDelete: 0 });

            if (!address) {
                return response(res, StatusCodes.NOT_FOUND, "Address not found");
            }

            const { name, phone, doorNo, street, city, state, pincode, label, isDefault } = body;

            if (isDefault && !address.isDefault) {
                await this.repo.updateMany(
                    { userId, isDelete: 0 },
                    { $set: { isDefault: false } }
                );
            }

            address.name = name ?? address.name;
            address.phone = phone ?? address.phone;
            address.doorNo = doorNo ?? address.doorNo;
            address.street = street ?? address.street;
            address.city = city ?? address.city;
            address.state = state ?? address.state;
            address.pincode = pincode ?? address.pincode;
            address.label = label ?? address.label;
            address.isDefault = isDefault ?? address.isDefault;

            await this.repo.save(address);

            return response(res, StatusCodes.OK, "Address updated successfully", address);
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }

    @Delete("/delete/:id")
    async deleteAddress(@Req() req: any, @Param("id") id: string, @Res() res: Response) {
        try {
            if (!ObjectId.isValid(id)) return response(res, StatusCodes.BAD_REQUEST, "Invalid ID");
            const userId = new ObjectId(req.user.userId);
            const address = await this.repo.findOneBy({ _id: new ObjectId(id), userId, isDelete: 0 });

            if (!address) {
                return response(res, StatusCodes.NOT_FOUND, "Address not found");
            }

            address.isDelete = 1;
            await this.repo.save(address);

            return response(res, StatusCodes.OK, "Address deleted successfully");
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }

    @Put("/set-default/:id")
    async setDefault(@Req() req: any, @Param("id") id: string, @Res() res: Response) {
        try {
            if (!ObjectId.isValid(id)) return response(res, StatusCodes.BAD_REQUEST, "Invalid ID");
            const userId = new ObjectId(req.user.userId);

            await this.repo.updateMany(
                { userId, isDelete: 0 },
                { $set: { isDefault: false } }
            );

            await this.repo.updateMany(
                { _id: new ObjectId(id), userId },
                { $set: { isDefault: true } }
            );

            return response(res, StatusCodes.OK, "Default address updated successfully");
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }
}
