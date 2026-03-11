import { Post, Body, Req, Res, UseBefore, JsonController, Get, QueryParam, Param } from "routing-controllers";
import { ObjectId } from "mongodb";
import { StatusCodes } from "http-status-codes";
import { AuthMiddleware, AuthPayload } from "../../middlewares/AuthMiddleware";
import { AppDataSource } from "../../data-source";
import { VendorPayment } from "../../entity/VendorPayment";
import { PurchaseOrder } from "../../entity/PurchaseOrder";
import { Vendor } from "../../entity/Vendor";
import { handleErrorResponse, pagination, response } from "../../utils";
import { Request, Response } from "express";

interface RequestWithUser extends Request {
    user: AuthPayload;
}

@UseBefore(AuthMiddleware)
@JsonController("/vendor-payment")
export class VendorPaymentController {
    private paymentRepo = AppDataSource.getMongoRepository(VendorPayment);
    private poRepo = AppDataSource.getMongoRepository(PurchaseOrder);
    private vendorRepo = AppDataSource.getMongoRepository(Vendor);

    @Post("/create")
    async create(
        @Req() req: RequestWithUser,
        @Body() body: {
            purchaseOrderId: string;
            amount: number;
            paymentMethod: string;
            paymentDate: string;
            remarks?: string;
        },
        @Res() res: Response
    ) {
        try {
            if (!ObjectId.isValid(body.purchaseOrderId)) {
                return response(res, StatusCodes.BAD_REQUEST, "Invalid Purchase Order ID");
            }

            const po = await this.poRepo.findOneBy({ _id: new ObjectId(body.purchaseOrderId) });
            if (!po) return response(res, StatusCodes.NOT_FOUND, "Purchase Order not found");

            const doc = new VendorPayment();
            doc.purchaseOrderId = new ObjectId(body.purchaseOrderId);
            doc.vendorId = po.vendorId;
            doc.amount = Number(body.amount);
            doc.paymentMethod = body.paymentMethod;
            doc.paymentDate = new Date(body.paymentDate || new Date());
            doc.remarks = body.remarks;
            doc.createdBy = new ObjectId(req.user.userId);

            await this.paymentRepo.save(doc);

            // Update PurchaseOrder paid amount and status
            po.paidAmount = (po.paidAmount || 0) + doc.amount;
            po.paymentMethod = doc.paymentMethod; // Record the latest method

            if (po.paidAmount >= po.grandTotal) {
                po.paymentStatus = "Paid";
            } else if (po.paidAmount > 0) {
                po.paymentStatus = "Partially Paid";
            } else {
                po.paymentStatus = "Pending";
            }

            await this.poRepo.save(po);

            return response(res, StatusCodes.CREATED, "Payment added successfully", doc);
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }

    @Get("/list")
    async list(
        @QueryParam("page") page: number = 0,
        @QueryParam("limit") limit: number = 10,
        @QueryParam("vendorId") vendorId: string,
        @QueryParam("status") status: string, // Based on PO payment status
        @QueryParam("fromDate") fromDate: string,
        @QueryParam("toDate") toDate: string,
        @Res() res: Response
    ) {
        try {
            // We need to list PURCHASE ORDERS mainly, showing their payment status
            const match: any = { isDelete: 0 };

            if (vendorId && ObjectId.isValid(vendorId)) {
                match.vendorId = new ObjectId(vendorId);
            }

            if (status) {
                match.paymentStatus = status;
            } else {
                // Default to show Pending if not filtered? User asked default pending.
                // We'll let them filter, but maybe default initial load is pending.
            }

            if (fromDate || toDate) {
                match.createdAt = {};
                if (fromDate) match.createdAt["$gte"] = new Date(fromDate);
                if (toDate) {
                    const tDate = new Date(toDate);
                    tDate.setHours(23, 59, 59, 999);
                    match.createdAt["$lte"] = tDate;
                }
            }

            const pipeline: any[] = [
                { $match: match },
                {
                    $lookup: {
                        from: "vendors",
                        localField: "vendorId",
                        foreignField: "_id",
                        as: "vendorData"
                    }
                },
                { $unwind: "$vendorData" },
                { $sort: { createdAt: -1 } },
                {
                    $facet: {
                        data: [{ $skip: page * limit }, { $limit: limit }],
                        meta: [{ $count: "total" }]
                    }
                }
            ];

            const result = await this.poRepo.aggregate(pipeline).toArray();
            const data = result[0]?.data || [];
            const total = result[0]?.meta[0]?.total || 0;

            return pagination(total, data, limit, page, res);
        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }

    @Get("/history/:poId")
    async history(@Param("poId") poId: string, @Res() res: Response) {
        try {
            if (!ObjectId.isValid(poId)) return response(res, StatusCodes.BAD_REQUEST, "Invalid id");

            const history = await this.paymentRepo.find({
                where: { purchaseOrderId: new ObjectId(poId) },
                order: { createdAt: -1 }
            });

            return response(res, StatusCodes.OK, "Payment history fetched", history);
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }
}
