import { JsonController, Get, QueryParams, Res, UseBefore } from "routing-controllers";
import { Response } from "express";
import { StatusCodes } from "http-status-codes";
import { ObjectId } from "mongodb";
import { AppDataSource } from "../../data-source";
import { Order } from "../../entity/Order";
import { Product } from "../../entity/Product";
import { Customer } from "../../entity/Customer";
import { Vendor } from "../../entity/Vendor";
import { PurchaseOrder } from "../../entity/PurchaseOrder";
import { AuthMiddleware } from "../../middlewares/AuthMiddleware";
import response from "../../utils/response";
import handleErrorResponse from "../../utils/commonFunction";

@JsonController("/admin/dashboard")
@UseBefore(AuthMiddleware)
export class DashboardController {
    private orderRepo = AppDataSource.getMongoRepository(Order);
    private productRepo = AppDataSource.getMongoRepository(Product);
    private customerRepo = AppDataSource.getMongoRepository(Customer);
    private vendorRepo = AppDataSource.getMongoRepository(Vendor);
    private purchaseOrderRepo = AppDataSource.getMongoRepository(PurchaseOrder);

    @Get("/stats")
    async getStats(@Res() res: Response) {
        try {
            const totalOrders = await this.orderRepo.count({ isDelete: 0 });
            const totalProducts = await this.productRepo.count({ isDelete: 0 });
            const totalCustomers = await this.customerRepo.count({ isDelete: 0 });
            
            const revenueResult = await this.orderRepo.aggregate([
                { $match: { isDelete: 0, orderStatus: { $ne: "Cancelled" } } },
                { $group: { _id: null, total: { $sum: "$grandTotal" } } }
            ]).toArray();

            const totalRevenue = revenueResult[0]?.total || 0;

            return response(res, StatusCodes.OK, "Stats fetched successfully", {
                totalOrders,
                totalProducts,
                totalCustomers,
                totalRevenue
            });
        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }

    @Get("/sales-overview")
    async getSalesOverview(@QueryParams() query: any, @Res() res: Response) {
        try {
            const filter = query.filter || "Day"; // Day, Weekly, Monthly, Yearly
            let groupBy: any = {};
            let sort: any = {};

            const now = new Date();
            let match: any = { isDelete: 0, orderStatus: { $ne: "Cancelled" }, orderFrom: "Website" };

            if (filter === "Day") {
                groupBy = { 
                    hour: { $hour: "$createdAt" }
                };
                sort = { "_id.hour": 1 };
                // Filter for today
                const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                match.createdAt = { $gte: startOfDay };
            } else if (filter === "Weekly") {
                groupBy = { 
                    dayOfWeek: { $dayOfWeek: "$createdAt" }
                };
                sort = { "_id.dayOfWeek": 1 };
                // Filter for last 7 days
                const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                match.createdAt = { $gte: lastWeek };
            } else if (filter === "Monthly") {
                groupBy = { 
                    week: { $week: "$createdAt" }
                };
                sort = { "_id.week": 1 };
                // Filter for current month
                const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
                match.createdAt = { $gte: startOfMonth };
            } else if (filter === "Yearly") {
                groupBy = { 
                    month: { $month: "$createdAt" }
                };
                sort = { "_id.month": 1 };
                // Filter for current year
                const startOfYear = new Date(now.getFullYear(), 0, 1);
                match.createdAt = { $gte: startOfYear };
            }

            const data = await this.orderRepo.aggregate([
                { $match: match },
                { $group: { 
                    _id: groupBy, 
                    totalAmount: { $sum: "$grandTotal" } 
                } },
                { $sort: sort }
            ]).toArray();

            return response(res, StatusCodes.OK, `Sales overview (${filter}) fetched successfully`, data);
        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }

    @Get("/top-selling-products")
    async getTopSellingProducts(@Res() res: Response) {
        try {
            const data = await this.orderRepo.aggregate([
                { $match: { isDelete: 0, orderStatus: { $ne: "Cancelled" } } },
                { $unwind: "$products" },
                { $group: {
                    _id: "$products.productId",
                    productName: { $first: "$products.productName" },
                    sku: { $first: "$products.sku" },
                    quantitySold: { $sum: "$products.qty" },
                    revenue: { $sum: "$products.total" }
                }},
                { $sort: { quantitySold: -1 } },
                { $limit: 10 }
            ]).toArray();

            return response(res, StatusCodes.OK, "Top selling products fetched successfully", data);
        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }

    @Get("/top-customers")
    async getTopCustomers(@Res() res: Response) {
        try {
            const data = await this.orderRepo.aggregate([
                { $match: { isDelete: 0, orderStatus: { $ne: "Cancelled" } } },
                { $group: {
                    _id: "$userId",
                    customerName: { $first: "$address.name" },
                    phoneNumber: { $first: "$address.phone" },
                    totalPurchase: { $sum: "$grandTotal" },
                    ordersCount: { $sum: 1 }
                }},
                { $sort: { totalPurchase: -1 } },
                { $limit: 5 }
            ]).toArray();

            return response(res, StatusCodes.OK, "Top customers fetched successfully", data);
        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }

    @Get("/top-vendors")
    async getTopVendors(@Res() res: Response) {
        try {
            const data = await this.purchaseOrderRepo.aggregate([
                { $match: { isDelete: 0 } },
                { $group: {
                    _id: "$vendorId",
                    totalPurchase: { $sum: "$grandTotal" },
                    ordersCount: { $sum: 1 }
                }},
                {
                    $lookup: {
                        from: "vendors",
                        localField: "_id",
                        foreignField: "_id",
                        as: "vendorData"
                    }
                },
                { $unwind: "$vendorData" },
                { $project: {
                    _id: 1,
                    vendorName: "$vendorData.vendorName",
                    totalPurchase: 1,
                    ordersCount: 1
                }},
                { $sort: { totalPurchase: -1 } },
                { $limit: 5 }
            ]).toArray();

            return response(res, StatusCodes.OK, "Top vendors fetched successfully", data);
        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }
}
