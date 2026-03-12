import { Get, JsonController, QueryParam, Res, UseBefore, Post, Body, Param } from "routing-controllers";
import { Response } from "express";
import { StatusCodes } from "http-status-codes";
import { AppDataSource } from "../../data-source";
import { Order } from "../../entity/Order";
import { PaymentDetail } from "../../entity/PaymentDetail";
import { AuthMiddleware } from "../../middlewares/AuthMiddleware";
import { handleErrorResponse, pagination, response } from "../../utils";
import { ObjectId } from "mongodb";

@UseBefore(AuthMiddleware)
@JsonController("/manual-payment")
export class ManualPaymentController {
    private orderRepo = AppDataSource.getMongoRepository(Order);
    private paymentRepo = AppDataSource.getMongoRepository(PaymentDetail);

    @Get("/list")
    async list(
        @QueryParam("page") page: number = 0,
        @QueryParam("limit") limit: number = 10,
        @QueryParam("paymentStatus") paymentStatus: string,
        @QueryParam("orderFrom") orderFrom: string, // POS or Website
        @QueryParam("search") search: string, // Search by orderId
        @Res() res: Response
    ) {
        try {
            const match: any = { isDelete: 0 };
            if (paymentStatus) match.paymentStatus = paymentStatus;
            if (orderFrom) match.orderFrom = orderFrom;
            if (search) match.orderId = { $regex: search, $options: "i" };

            const [data, total] = await this.orderRepo.findAndCount({
                where: match,
                order: { createdAt: "DESC" },
                take: limit,
                skip: page * limit
            });

            // For each order, find payment details to show balance/received amount
            const results = await Promise.all(data.map(async (order) => {
                const paymentDetail = await this.paymentRepo.findOneBy({ orderId: order.id, isDelete: 0 });
                return {
                    ...JSON.parse(JSON.stringify(order)),
                    _id: order.id,
                    receivedAmount: paymentDetail ? paymentDetail.receivedAmount : (order.paymentStatus === "Paid" ? order.grandTotal : 0),
                    balanceAmount: paymentDetail ? paymentDetail.balanceAmount : (order.paymentStatus === "Paid" ? 0 : order.grandTotal)
                };
            }));

            return pagination(total, results, limit, page, res);
        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }

    @Get("/details/:id")
    async details(@Param("id") id: string, @Res() res: Response) {
        try {
            const order = await this.orderRepo.findOneBy({ _id: new ObjectId(id) });
            if (!order) return response(res, StatusCodes.NOT_FOUND, "Order not found");

            const paymentDetail = await this.paymentRepo.findOneBy({ orderId: order.id, isDelete: 0 });

            return response(res, StatusCodes.OK, "Order details fetched", {
                order,
                paymentDetail: paymentDetail || {
                    payments: [],
                    receivedAmount: order.paymentStatus === "Paid" ? order.grandTotal : 0,
                    balanceAmount: order.paymentStatus === "Paid" ? 0 : order.grandTotal
                }
            });
        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }

    @Post("/update")
    async update(@Body() body: any, @Res() res: Response) {
        try {
            const { orderId, amount, method, paymentStatus } = body;

            if (!orderId || !method) {
                return response(res, StatusCodes.BAD_REQUEST, "Order ID and method are required");
            }

            const order = await this.orderRepo.findOneBy({ _id: new ObjectId(orderId) });
            if (!order) return response(res, StatusCodes.NOT_FOUND, "Order not found");

            let paymentDetail = await this.paymentRepo.findOneBy({ orderId: order.id, isDelete: 0 });

            if (!paymentDetail) {
                paymentDetail = new PaymentDetail();
                paymentDetail.orderId = order.id;
                paymentDetail.payments = [];
                paymentDetail.totalAmount = order.grandTotal;
                paymentDetail.receivedAmount = 0;
                paymentDetail.balanceAmount = order.grandTotal;
            }

            // Only add payment if amount is provided and > 0
            if (amount && Number(amount) > 0) {
                paymentDetail.payments.push({
                    method: method,
                    amount: Number(amount)
                });
                paymentDetail.receivedAmount += Number(amount);
                paymentDetail.balanceAmount = order.grandTotal - paymentDetail.receivedAmount;
                
                // Ensure balance doesn't go below 0
                if (paymentDetail.balanceAmount < 0) paymentDetail.balanceAmount = 0;
            }

            await this.paymentRepo.save(paymentDetail);

            // Update order payment status and method
            order.paymentMethod = method; // Update to latest method or keep as "Multiple"
            if (paymentDetail.payments.length > 1) {
                order.paymentMethod = "Multiple";
            }
            
            // Logic for status: if provided in body, use it. Otherwise calculate.
            if (paymentStatus) {
                order.paymentStatus = paymentStatus;
            } else {
                if (paymentDetail.receivedAmount >= order.grandTotal) {
                    order.paymentStatus = "Paid";
                } else if (paymentDetail.receivedAmount > 0) {
                    order.paymentStatus = "Partially Paid";
                } else {
                    order.paymentStatus = "Pending";
                }
            }

            await this.orderRepo.save(order);

            return response(res, StatusCodes.OK, "Payment updated successfully", {
                order,
                paymentDetail
            });
        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }
}
