import { Get, JsonController, QueryParam, Res, UseBefore } from "routing-controllers";
import { Response } from "express";
import { StatusCodes } from "http-status-codes";
import { AppDataSource } from "../../data-source";
import { Order } from "../../entity/Order";
import { VendorPayment } from "../../entity/VendorPayment";
import { AuthMiddleware } from "../../middlewares/AuthMiddleware";
import { handleErrorResponse, pagination } from "../../utils";

@UseBefore(AuthMiddleware)
@JsonController("/payment-history")
export class PaymentHistoryController {
    private orderRepo = AppDataSource.getMongoRepository(Order);
    private vendorPaymentRepo = AppDataSource.getMongoRepository(VendorPayment);

    @Get("/list")
    async list(
        @QueryParam("page") page: number = 0,
        @QueryParam("limit") limit: number = 10,
        @QueryParam("paymentMethod") paymentMethod: string,
        @QueryParam("fromDate") fromDate: string,
        @QueryParam("toDate") toDate: string,
        @QueryParam("search") search: string, // Search by orderId
        @Res() res: Response
    ) {
        try {
            const orderMatch: any = { isDelete: 0, paymentStatus: "Paid" };
            const vendorPaymentMatch: any = {};

            if (paymentMethod) {
                orderMatch.paymentMethod = paymentMethod;
                vendorPaymentMatch.paymentMethod = paymentMethod;
            }

            if (fromDate || toDate) {
                const dateFilter: any = {};
                if (fromDate) dateFilter["$gte"] = new Date(fromDate);
                if (toDate) {
                    const tDate = new Date(toDate);
                    tDate.setHours(23, 59, 59, 999);
                    dateFilter["$lte"] = tDate;
                }
                orderMatch.createdAt = dateFilter;
                vendorPaymentMatch.paymentDate = dateFilter;
            }

            if (search) {
                orderMatch.orderId = { $regex: search, $options: "i" };
            }

            // Pipeline for Orders (POS & Website)
            const orderPipeline: any[] = [
                { $match: orderMatch },
                {
                    $project: {
                        type: "$orderFrom",
                        orderId: 1,
                        date: "$createdAt",
                        amount: "$grandTotal",
                        paymentMethod: 1,
                        paidBy: "$address.name",
                        details: "$$ROOT"
                    }
                }
            ];

            // Pipeline for Vendor Payments
            const vendorPipeline: any[] = [
                { $match: vendorPaymentMatch },
                {
                    $lookup: {
                        from: "purchase_orders",
                        localField: "purchaseOrderId",
                        foreignField: "_id",
                        as: "po"
                    }
                },
                { $unwind: "$po" },
                {
                    $lookup: {
                        from: "vendors",
                        localField: "vendorId",
                        foreignField: "_id",
                        as: "vendor"
                    }
                },
                { $unwind: "$vendor" },
                {
                    $project: {
                        type: { $literal: "Vendor" },
                        orderId: "$po.orderId",
                        date: "$paymentDate",
                        amount: 1,
                        paymentMethod: 1,
                        paidBy: "$vendor.name",
                        details: "$$ROOT"
                    }
                }
            ];

            if (search) {
                vendorPipeline.push({
                    $match: { orderId: { $regex: search, $options: "i" } }
                });
            }

            const orders = await this.orderRepo.aggregate(orderPipeline).toArray();
            const vendorPayments = await this.vendorPaymentRepo.aggregate(vendorPipeline).toArray();

            let combined = [...orders, ...vendorPayments];
            combined.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

            const total = combined.length;
            const paginatedData = combined.slice(page * limit, (page + 1) * limit);

            return pagination(total, paginatedData, limit, page, res);
        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }
}
