import { JsonController, Get, QueryParams, Res, UseBefore } from "routing-controllers";
import { AppDataSource } from "../../data-source";
import { Order } from "../../entity/Order";
import { Customer } from "../../entity/Customer";
import { Vendor } from "../../entity/Vendor";
import { PurchaseOrder } from "../../entity/PurchaseOrder";
import { VendorPayment } from "../../entity/VendorPayment";
import { PaymentDetail } from "../../entity/PaymentDetail";
import { StatusCodes } from "http-status-codes";
import { response, pagination, handleErrorResponse } from "../../utils";
import { AuthMiddleware } from "../../middlewares/AuthMiddleware";

@JsonController("/reports")
@UseBefore(AuthMiddleware)
export class ReportsController {
    private orderRepo = AppDataSource.getMongoRepository(Order);
    private customerRepo = AppDataSource.getMongoRepository(Customer);
    private vendorRepo = AppDataSource.getMongoRepository(Vendor);
    private purchaseOrderRepo = AppDataSource.getMongoRepository(PurchaseOrder);
    private vendorPaymentRepo = AppDataSource.getMongoRepository(VendorPayment);

    @Get("/product")
    async productReport(@QueryParams() query: any, @Res() res: any) {
        try {
            const page = Number(query.page) || 0;
            const limit = Number(query.limit) || 10;
            const search = query.search?.trim();
            const fromDate = query.fromDate;
            const toDate = query.toDate;
            const orderFrom = query.orderFrom;

            const match: any = { isDelete: { $ne: 1 } };

            if (orderFrom) {
                if (orderFrom === "Both") {
                    match.orderFrom = { $in: ["POS", "Website", undefined] };
                } else {
                    match.orderFrom = orderFrom;
                }
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
                { $unwind: "$products" },
                {
                    $group: {
                        _id: "$products.productId",
                        productName: { $first: "$products.productName" },
                        sku: { $first: "$products.sku" },
                        totalQuantitySold: { $sum: { $toDouble: { $ifNull: ["$products.qty", "$products.quantity"] } } },
                        totalRevenue: { $sum: { $toDouble: "$products.total" } },
                    }
                }
            ];

            if (search) {
                pipeline.push({
                    $match: {
                        $or: [
                            { productName: { $regex: search, $options: "i" } },
                            { sku: { $regex: search, $options: "i" } }
                        ]
                    }
                });
            }

            pipeline.push({ $sort: { totalQuantitySold: -1 } });

            if (limit !== -1) {
                pipeline.push(
                    {
                        $facet: {
                            data: [{ $skip: page * limit }, { $limit: limit }],
                            meta: [{ $count: "total" }]
                        }
                    }
                );
            }

            const result = await this.orderRepo.aggregate(pipeline).toArray();

            if (limit === -1) {
                return response(res, StatusCodes.OK, "Product reports fetched successfully", result);
            }

            const data = result[0]?.data || [];
            const total = result[0]?.meta[0]?.total || 0;

            return pagination(total, data, limit, page, res);

        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }

    @Get("/customer")
    async customerReport(@QueryParams() query: any, @Res() res: any) {
        try {
            const page = Number(query.page) || 0;
            const limit = Number(query.limit) || 10;
            const search = query.search?.trim();
            const fromDate = query.fromDate;
            const toDate = query.toDate;

            const match: any = { isDelete: { $ne: 1 } };

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
                    $group: {
                        _id: "$userId",
                        totalOrders: { $sum: 1 },
                        totalSpent: { $sum: { $toDouble: "$grandTotal" } },
                        lastOrderDate: { $max: "$createdAt" }
                    }
                },
                {
                    $lookup: {
                        from: "customers",
                        localField: "_id",
                        foreignField: "_id",
                        as: "customerData"
                    }
                },
                { $unwind: { path: "$customerData", preserveNullAndEmptyArrays: true } },
                {
                    $project: {
                        fullName: { $ifNull: ["$customerData.fullName", "Guest User"] },
                        phoneNumber: { $ifNull: ["$customerData.phoneNumber", "N/A"] },
                        email: { $ifNull: ["$customerData.email", "N/A"] },
                        totalOrders: 1,
                        totalSpent: 1,
                        lastOrderDate: 1
                    }
                }
            ];

            if (search) {
                pipeline.push({
                    $match: {
                        $or: [
                            { fullName: { $regex: search, $options: "i" } },
                            { phoneNumber: { $regex: search, $options: "i" } }
                        ]
                    }
                });
            }

            pipeline.push({ $sort: { totalSpent: -1 } });

            if (limit !== -1) {
                pipeline.push(
                    {
                        $facet: {
                            data: [{ $skip: page * limit }, { $limit: limit }],
                            meta: [{ $count: "total" }]
                        }
                    }
                );
            }

            const result = await this.orderRepo.aggregate(pipeline).toArray();

            if (limit === -1) {
                return response(res, StatusCodes.OK, "Customer reports fetched successfully", result);
            }

            const data = result[0]?.data || [];
            const total = result[0]?.meta[0]?.total || 0;

            return pagination(total, data, limit, page, res);

        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }

    @Get("/vendor")
    async vendorReport(@QueryParams() query: any, @Res() res: any) {
        try {
            const page = Number(query.page) || 0;
            const limit = Number(query.limit) || 10;
            const search = query.search?.trim();
            const fromDate = query.fromDate;
            const toDate = query.toDate;

            const match: any = { isDelete: 0 };

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
                    $group: {
                        _id: "$vendorId",
                        totalPurchases: { $sum: 1 },
                        totalAmount: { $sum: { $toDouble: "$grandTotal" } },
                        totalPaid: { $sum: { $toDouble: "$paidAmount" } },
                    }
                },
                {
                    $lookup: {
                        from: "vendors",
                        localField: "_id",
                        foreignField: "_id",
                        as: "vendorData"
                    }
                },
                { $unwind: "$vendorData" },
                {
                    $project: {
                        vendorName: "$vendorData.name", // entity uses 'name'
                        contactPerson: "$vendorData.contactPerson",
                        contactNumber: "$vendorData.phoneNumber", // entity uses 'phoneNumber'
                        totalPurchases: 1,
                        totalAmount: 1,
                        totalPaid: 1,
                        pendingAmount: { $subtract: ["$totalAmount", "$totalPaid"] }
                    }
                }
            ];

            if (search) {
                pipeline.push({
                    $match: {
                        $or: [
                            { vendorName: { $regex: search, $options: "i" } },
                            { contactPerson: { $regex: search, $options: "i" } },
                            { contactNumber: { $regex: search, $options: "i" } }
                        ]
                    }
                });
            }

            pipeline.push({ $sort: { pendingAmount: -1 } });

            if (limit !== -1) {
                pipeline.push(
                    {
                        $facet: {
                            data: [{ $skip: page * limit }, { $limit: limit }],
                            meta: [{ $count: "total" }]
                        }
                    }
                );
            }

            const result = await this.purchaseOrderRepo.aggregate(pipeline).toArray();

            if (limit === -1) {
                return response(res, StatusCodes.OK, "Vendor reports fetched successfully", result);
            }

            const data = result[0]?.data || [];
            const total = result[0]?.meta[0]?.total || 0;

            return pagination(total, data, limit, page, res);

        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }

    @Get("/payment")
    async paymentReport(@QueryParams() query: any, @Res() res: any) {
        try {
            const page = Number(query.page) || 0;
            const limit = Number(query.limit) || 10;
            const paymentMode = query.paymentMode;
            const fromDate = query.fromDate;
            const toDate = query.toDate;

            // Gather all payments into one massive flow for reporting
            let allPayments: any[] = [];

            // 1. Vendor Payments
            const vendorMatch: any = { isDelete: { $ne: 1 } };
            if (fromDate || toDate) {
                vendorMatch.paymentDate = {};
                if (fromDate) vendorMatch.paymentDate["$gte"] = new Date(fromDate);
                if (toDate) {
                    const tDate = new Date(toDate);
                    tDate.setHours(23, 59, 59, 999);
                    vendorMatch.paymentDate["$lte"] = tDate;
                }
            }

            const vPayments = await this.vendorPaymentRepo.find({ where: vendorMatch });
            for (const vp of vPayments) {
                if (paymentMode && vp.paymentMethod !== paymentMode) continue;
                allPayments.push({
                    date: vp.paymentDate || vp.createdAt,
                    type: "Outgoing",
                    source: "Vendor Payment",
                    referenceId: vp.purchaseOrderId,
                    method: vp.paymentMethod || "Cash",
                    amount: vp.amount
                });
            }

            // 2. POS Orders (using PaymentDetail for exact amounts)
            const posPaymentRepo = AppDataSource.getMongoRepository(PaymentDetail);
            const posOrdersMatch: any = { isDelete: { $ne: 1 } };
            if (fromDate || toDate) {
                posOrdersMatch.createdAt = {};
                if (fromDate) posOrdersMatch.createdAt["$gte"] = new Date(fromDate);
                if (toDate) {
                    const tDate = new Date(toDate);
                    tDate.setHours(23, 59, 59, 999);
                    posOrdersMatch.createdAt["$lte"] = tDate;
                }
            }
            const posPayments = await posPaymentRepo.find({ where: posOrdersMatch });
            for (const pp of posPayments) {
                const orderDate = pp.createdAt;
                for (const p of (pp.payments || [])) {
                    if (paymentMode && p.method !== paymentMode) continue;
                    allPayments.push({
                        date: orderDate,
                        type: "Incoming",
                        source: "POS Order",
                        referenceId: pp.orderId,
                        method: p.method,
                        amount: Number(p.amount)
                    });
                }
            }

            // 3. Website Orders (Directly from Order entity since it doesn't always use PaymentDetail)
            const webOrderMatch: any = { orderFrom: { $ne: "POS" }, isDelete: { $ne: 1 }, paymentStatus: { $in: ["Paid", "Partially Paid"] } };
            if (fromDate || toDate) {
                webOrderMatch.createdAt = {};
                if (fromDate) webOrderMatch.createdAt["$gte"] = new Date(fromDate);
                if (toDate) {
                    const tDate = new Date(toDate);
                    tDate.setHours(23, 59, 59, 999);
                    webOrderMatch.createdAt["$lte"] = tDate;
                }
            }
            const webOrders = await this.orderRepo.find({ where: webOrderMatch });
            for (const wo of webOrders) {
                if (paymentMode && wo.paymentMethod !== paymentMode) continue;
                allPayments.push({
                    date: wo.createdAt,
                    type: "Incoming",
                    source: "Website Order",
                    referenceId: wo.orderId,
                    method: wo.paymentMethod || "Cash",
                    amount: wo.grandTotal // Assuming fully paid for simplicity here
                });
            }

            // Sort all by date descending
            allPayments.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

            const total = allPayments.length;

            if (limit === -1) {
                return response(res, StatusCodes.OK, "Payment reports fetched successfully", allPayments);
            }

            allPayments = allPayments.slice(page * limit, (page + 1) * limit);
            return pagination(total, allPayments, limit, page, res);

        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }

    @Get("/sales")
    async salesReport(@QueryParams() query: any, @Res() res: any) {
        try {
            const page = Number(query.page) || 0;
            const limit = Number(query.limit) || 10;
            const search = query.search?.trim();
            const fromDate = query.fromDate;
            const toDate = query.toDate;

            const match: any = { isDelete: { $ne: 1 }, orderStatus: { $nin: ["Cancelled", "Return"] } };

            if (fromDate || toDate) {
                match.createdAt = {};
                if (fromDate) match.createdAt["$gte"] = new Date(fromDate);
                if (toDate) {
                    const tDate = new Date(toDate);
                    tDate.setHours(23, 59, 59, 999);
                    match.createdAt["$lte"] = tDate;
                }
            }

            if (search) {
                match.orderId = { $regex: search, $options: "i" };
            }

            if (limit === -1) {
                const data = await this.orderRepo.find({
                    where: match,
                    order: { createdAt: "DESC" }
                });
                return response(res, StatusCodes.OK, "Sales reports fetched successfully", data);
            }

            const skip = page * limit;
            const [orders, total] = await this.orderRepo.findAndCount({
                where: match,
                order: { createdAt: "DESC" },
                take: limit,
                skip: skip
            });

            return pagination(total, orders, limit, page, res);

        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }
}
