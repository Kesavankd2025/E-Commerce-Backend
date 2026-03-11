import { Post, Body, Req, Res, UseBefore, JsonController, Put, Param, Get, Delete, QueryParam } from "routing-controllers";
import { ObjectId } from "mongodb";
import { StatusCodes } from "http-status-codes";
import { AuthMiddleware, AuthPayload } from "../../middlewares/AuthMiddleware";
import { AppDataSource } from "../../data-source";
import { Vendor } from "../../entity/Vendor";
import { handleErrorResponse, pagination, response } from "../../utils";
import { Request, Response } from "express";

interface RequestWithUser extends Request {
    user: AuthPayload;
}

@UseBefore(AuthMiddleware)
@JsonController("/vendor")
export class VendorController {
    private repo = AppDataSource.getMongoRepository(Vendor);

    @Post("/create")
    async create(
        @Req() req: RequestWithUser,
        @Body() body: any,
        @Res() res: Response
    ) {
        try {
            const doc = new Vendor();
            doc.name = body.name;
            doc.contactPerson = body.contactPerson;
            doc.phoneNumber = body.phoneNumber;
            doc.address = body.address;
            doc.gstNumber = body.gstNumber;
            doc.bankName = body.bankName;
            doc.accountNumber = body.accountNumber;
            doc.ifscCode = body.ifscCode;
            doc.status = body.status !== undefined ? body.status : true;
            doc.isDelete = 0;
            doc.createdBy = new ObjectId(req.user.userId);
            doc.createdAt = new Date();

            await this.repo.save(doc);
            return response(res, StatusCodes.CREATED, "Vendor created successfully", doc);
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }

    @Put("/edit/:id")
    async edit(
        @Param("id") id: string,
        @Req() req: RequestWithUser,
        @Body() body: any,
        @Res() res: Response
    ) {
        try {
            if (!ObjectId.isValid(id)) return response(res, StatusCodes.BAD_REQUEST, "Invalid id");

            const doc = await this.repo.findOneBy({ _id: new ObjectId(id), isDelete: 0 });
            if (!doc) return response(res, StatusCodes.NOT_FOUND, "Vendor not found");

            if (body.name !== undefined) doc.name = body.name;
            if (body.contactPerson !== undefined) doc.contactPerson = body.contactPerson;
            if (body.phoneNumber !== undefined) doc.phoneNumber = body.phoneNumber;
            if (body.address !== undefined) doc.address = body.address;
            if (body.gstNumber !== undefined) doc.gstNumber = body.gstNumber;
            if (body.bankName !== undefined) doc.bankName = body.bankName;
            if (body.accountNumber !== undefined) doc.accountNumber = body.accountNumber;
            if (body.ifscCode !== undefined) doc.ifscCode = body.ifscCode;
            if (body.status !== undefined) doc.status = body.status;

            doc.updatedBy = new ObjectId(req.user.userId);
            doc.updatedAt = new Date();

            await this.repo.save(doc);
            return response(res, StatusCodes.OK, "Vendor updated successfully", doc);
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }

    @Get("/list")
    async list(
        @QueryParam("page") page: number = 0,
        @QueryParam("limit") limit: number = 10,
        @QueryParam("search") search: string,
        @QueryParam("status") status: string,
        @Res() res: Response
    ) {
        try {
            const match: any = { isDelete: 0 };
            if (status !== undefined && status !== "") match.status = String(status) === 'true';

            if (search) {
                match.$or = [
                    { name: { $regex: search, $options: "i" } },
                    { contactPerson: { $regex: search, $options: "i" } },
                    { phoneNumber: { $regex: search, $options: "i" } }
                ];
            }

            const pipeline: any[] = [
                { $match: match },
                { $sort: { createdAt: -1 } },
                {
                    $facet: {
                        data: [{ $skip: page * limit }, { $limit: limit }],
                        meta: [{ $count: "total" }]
                    }
                }
            ];

            const result = await this.repo.aggregate(pipeline).toArray();
            const data = result[0]?.data || [];
            const total = result[0]?.meta[0]?.total || 0;

            return pagination(total, data, limit, page, res);
        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }

    @Get("/details/:id")
    async details(@Param("id") id: string, @Res() res: Response) {
        try {
            if (!ObjectId.isValid(id)) return response(res, StatusCodes.BAD_REQUEST, "Invalid id");

            const doc = await this.repo.findOneBy({ _id: new ObjectId(id), isDelete: 0 });
            if (!doc) return response(res, StatusCodes.NOT_FOUND, "Vendor not found");

            return response(res, StatusCodes.OK, "Details fetched successfully", doc);
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }

    @Delete("/delete/:id")
    async delete(@Param("id") id: string, @Req() req: RequestWithUser, @Res() res: Response) {
        try {
            if (!ObjectId.isValid(id)) return response(res, StatusCodes.BAD_REQUEST, "Invalid id");

            const doc = await this.repo.findOneBy({ _id: new ObjectId(id), isDelete: 0 });
            if (!doc) return response(res, StatusCodes.NOT_FOUND, "Vendor not found");

            doc.isDelete = 1;
            doc.updatedBy = new ObjectId(req.user.userId);
            doc.updatedAt = new Date();
            await this.repo.save(doc);

            return response(res, StatusCodes.OK, "Vendor deleted successfully");
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }
}
