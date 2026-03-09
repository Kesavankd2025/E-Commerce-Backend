import {
    Post,
    Body,
    Req,
    Res,
    UseBefore,
    JsonController,
    Put,
    Param,
    Get,
    Delete
} from "routing-controllers";
import { ObjectId } from "mongodb";
import { StatusCodes } from "http-status-codes";
import { AuthMiddleware, AuthPayload } from "../../middlewares/AuthMiddleware";
import { AppDataSource } from "../../data-source";
import { Order, OrderStatus, PaymentStatus } from "../../entity/Order";
import { CreateOrderDto } from "../../dto/admin/Order.dto";
import { handleErrorResponse, pagination, response } from "../../utils";
import { generateOrderId } from "../../utils/id.generator";

interface RequestWithUser extends Request {
    query: any;
    user: AuthPayload;
}

@UseBefore(AuthMiddleware)
@JsonController("/orders")
export class OrderController {

    private orderRepository = AppDataSource.getMongoRepository(Order);

    @Post("/create")
    async createOrder(
        @Req() req: RequestWithUser,
        @Body() body: CreateOrderDto,
        @Res() res: Response
    ) {
        try {

            const order = new Order();

            order.zoneId = new ObjectId(body.zoneId);
            order.regionId = new ObjectId(body.regionId);
            order.chapterId = new ObjectId(body.chapterId);
            order.memberId = new ObjectId(body.memberId);
            order.grantTotal = body.grantTotal;
            if (body.products?.length) {
                order.products = body.products.map(p => ({
                    ...p,
                    productId: new ObjectId(p.productId)
                }));
            }

            order.orderId = await generateOrderId();

            order.isActive = 1;
            order.isDelete = 0;
            order.createdBy = new ObjectId(req.user.userId);
            order.createdAt = new Date();
            order.status = OrderStatus.PENDING;
            order.paymentStatus = PaymentStatus.PENDING;

            await this.orderRepository.save(order);

            return response(
                res,
                StatusCodes.CREATED,
                "Order created successfully",
                order
            );

        } catch (error: any) {
            return response(
                res,
                StatusCodes.INTERNAL_SERVER_ERROR,
                error.message || "Something went wrong"
            );
        }
    }

    @Put("/edit/:id")
    async editOrder(
        @Param("id") id: string,
        @Req() req: RequestWithUser,
        @Body() body: CreateOrderDto,
        @Res() res: Response
    ) {
        try {

            if (!ObjectId.isValid(id)) {
                return response(res, StatusCodes.BAD_REQUEST, "Invalid order id");
            }

            const order = await this.orderRepository.findOneBy({
                _id: new ObjectId(id),
                isDelete: 0
            });

            if (!order) {
                return response(res, StatusCodes.NOT_FOUND, "Order not found");
            }

            if (body.zoneId) order.zoneId = new ObjectId(body.zoneId);
            if (body.regionId) order.regionId = new ObjectId(body.regionId);
            if (body.chapterId) order.chapterId = new ObjectId(body.chapterId);
            if (body.memberId) order.memberId = new ObjectId(body.memberId);
            if (body.products?.length) {
                order.products = body.products.map(p => ({
                    ...p,
                    productId: new ObjectId(p.productId)
                }));
            }

            order.grantTotal = body.grantTotal;

            order.updatedBy = new ObjectId(req.user.userId);
            order.updatedAt = new Date();

            await this.orderRepository.save(order);

            return response(
                res,
                StatusCodes.OK,
                "Order updated successfully",
                order
            );

        } catch (error: any) {
            return response(
                res,
                StatusCodes.INTERNAL_SERVER_ERROR,
                error.message || "Something went wrong"
            );
        }
    }

    @Put("/status/:id")
    async orderStatus(
        @Param("id") id: string,
        @Req() req: RequestWithUser,
        @Body() body: any,
        @Res() res: Response
    ) {
        try {

            if (!ObjectId.isValid(id)) {
                return response(res, StatusCodes.BAD_REQUEST, "Invalid order id");
            }

            const order = await this.orderRepository.findOneBy({
                _id: new ObjectId(id),
                isDelete: 0
            });

            if (!order) {
                return response(res, StatusCodes.NOT_FOUND, "Order not found");
            }

            order.status = body.status;
            order.paymentStatus = body.paymentStatus;
            order.updatedBy = new ObjectId(req.user.userId);
            order.updatedAt = new Date();

            await this.orderRepository.save(order);

            return response(
                res,
                StatusCodes.OK,
                "Order updated successfully",
                order
            );

        } catch (error: any) {
            return response(
                res,
                StatusCodes.INTERNAL_SERVER_ERROR,
                error.message || "Something went wrong"
            );
        }
    }

    @Get("/list")
    async listOrders(
        @Req() req: RequestWithUser,
        @Res() res: Response
    ) {
        try {
            const page = Math.max(Number(req.query.page) || 0, 0);
            const limit = Math.max(Number(req.query.limit) || 10, 1);

            const zoneId = req.query.zoneId?.toString();
            const regionId = req.query.regionId?.toString();
            const chapterId = req.query.chapterId?.toString();
            const memberId = req.query.memberId?.toString();
            const search = req.query.search?.trim();

            const match: any = { isDelete: 0 };

            if (zoneId) match.zoneId = new ObjectId(zoneId);
            if (regionId) match.regionId = new ObjectId(regionId);
            if (chapterId) match.chapterId = new ObjectId(chapterId);
            if (memberId) match.memberId = new ObjectId(memberId);

            const pipeline = [
                { $match: match },

                // Convert to ObjectId
                {
                    $addFields: {
                        zoneIdObj: { $toObjectId: "$zoneId" },
                        regionIdObj: { $toObjectId: "$regionId" },
                        chapterIdObj: { $toObjectId: "$chapterId" },
                        memberIdObj: { $toObjectId: "$memberId" },
                    }
                },

                // LOOKUPS
                {
                    $lookup: {
                        from: "zones",
                        localField: "zoneIdObj",
                        foreignField: "_id",
                        as: "zone"
                    }
                },
                { $unwind: { path: "$zone", preserveNullAndEmptyArrays: true } },

                {
                    $lookup: {
                        from: "regions",
                        localField: "regionIdObj",
                        foreignField: "_id",
                        as: "region"
                    }
                },
                { $unwind: { path: "$region", preserveNullAndEmptyArrays: true } },

                {
                    $lookup: {
                        from: "chapters",
                        localField: "chapterIdObj",
                        foreignField: "_id",
                        as: "chapter"
                    }
                },
                { $unwind: { path: "$chapter", preserveNullAndEmptyArrays: true } },

                {
                    $lookup: {
                        from: "member",
                        localField: "memberIdObj",
                        foreignField: "_id",
                        as: "members"
                    }
                },
                { $unwind: { path: "$members", preserveNullAndEmptyArrays: true } },

                // PRODUCT LOOKUP
                {
                    $lookup: {
                        from: "products",
                        localField: "products.productId",
                        foreignField: "_id",
                        as: "productDetails"
                    }
                },

                // Compute total quantity
                {
                    $addFields: {
                        totalQty: { $sum: "$products.qty" }
                    }
                },

                // FIX DUPLICATION
                { $unwind: { path: "$productDetails", preserveNullAndEmptyArrays: true } },

                {
                    $group: {
                        _id: "$_id",
                        orderId: { $first: "$orderId" },
                        status: { $first: "$status" },
                        grantTotal: { $first: "$grantTotal" },
                        createdAt: { $first: "$createdAt" },
                        zone: { $first: "$zone" },
                        region: { $first: "$region" },
                        chapter: { $first: "$chapter" },
                        members: { $first: "$members" },
                        totalQty: { $first: "$totalQty" },
                        paymentStatus: { $first: '$paymentStatus' },
                        productNames: { $push: "$productDetails.productName" }
                    }
                },

                // FINAL OUTPUT
                {
                    $project: {
                        orderId: 1,
                        orderDate: "$createdAt",
                        totalQty: 1,
                        zoneName: "$zone.name",
                        regionName: "$region.region",
                        chapterName: "$chapter.chapterName",
                        memberName: "$members.fullName",
                        phoneNumber: "$members.phoneNumber",
                        status: 1,
                        paymentStatus: 1,
                        grantTotal: 1,

                        // Pick first productName (same as your sample output)
                        productName: {
                            $cond: [
                                { $gt: [{ $size: "$productNames" }, 0] },
                                { $arrayElemAt: ["$productNames", 0] },
                                ""
                            ]
                        }
                    }
                },
                ...(search ? [{
                    $match: {
                        $or: [
                            { orderId: { $regex: search, $options: "i" } },
                            { memberName: { $regex: search, $options: "i" } },
                            { phoneNumber: { $regex: search, $options: "i" } },
                            { status: { $regex: search, $options: "i" } },
                            { paymentStatus: { $regex: search, $options: "i" } },
                            { totalQty: { $regex: search, $options: "i" } },
                        ]
                    }
                }] : []),
                { $sort: { orderDate: -1 } },

                {
                    $facet: {
                        data: [
                            { $skip: page * limit },
                            { $limit: limit }
                        ],
                        meta: [{ $count: "total" }]
                    }
                }
            ];

            const result = await this.orderRepository.aggregate(pipeline).toArray();

            const data = result[0]?.data || [];
            const total = result[0]?.meta[0]?.total || 0;

            return pagination(total, data, limit, page, res);

        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }



    // --------------------------------------------------
    // ORDER DETAILS
    // --------------------------------------------------
    @Get("/details/:id")
    async orderDetails(
        @Param("id") id: string,
        @Req() req: RequestWithUser,
        @Res() res: Response
    ) {
        try {
            if (!ObjectId.isValid(id)) {
                return response(res, StatusCodes.BAD_REQUEST, "Invalid order id");
            }

            const pipeline = [
                { $match: { _id: new ObjectId(id), isDelete: 0 } },

                // -------------------------
                // LOOKUPS (NO CONVERSION NEEDED – IDs ARE ObjectId)
                // -------------------------
                {
                    $lookup: {
                        from: "zones",
                        localField: "zoneId",
                        foreignField: "_id",
                        as: "zone"
                    }
                },
                { $unwind: { path: "$zone", preserveNullAndEmptyArrays: true } },

                {
                    $lookup: {
                        from: "regions",
                        localField: "regionId",
                        foreignField: "_id",
                        as: "region"
                    }
                },
                { $unwind: { path: "$region", preserveNullAndEmptyArrays: true } },

                {
                    $lookup: {
                        from: "chapters",
                        localField: "chapterId",
                        foreignField: "_id",
                        as: "chapter"
                    }
                },
                { $unwind: { path: "$chapter", preserveNullAndEmptyArrays: true } },

                {
                    $lookup: {
                        from: "member", // ⚠️ plural
                        localField: "memberId",
                        foreignField: "_id",
                        as: "members"
                    }
                },
                { $unwind: { path: "$members", preserveNullAndEmptyArrays: true } },

                // -------------------------
                // 🔥 UNWIND PRODUCTS
                // -------------------------
                { $unwind: "$products" },

                {
                    $lookup: {
                        from: "products",
                        localField: "products.productId",
                        foreignField: "_id",
                        as: "product"
                    }
                },
                { $unwind: { path: "$product", preserveNullAndEmptyArrays: true } },

                // -------------------------
                // 🔥 GROUP BACK PRODUCTS
                // -------------------------
                {
                    $group: {
                        _id: "$_id",
                        orderId: { $first: "$orderId" },
                        orderDate: { $first: "$createdAt" },
                        status: { $first: "$status" },
                        grantTotal: { $first: "$grantTotal" },

                        zoneName: { $first: "$zone.name" },
                        regionName: { $first: "$region.region" },
                        chapterName: { $first: "$chapter.chapterName" },
                        memberName: { $first: "$members.fullName" },
                        contactNumber: { $first: "$members.phoneNumber" },

                        products: {
                            $push: {
                                productId: "$products.productId",
                                productName: "$product.productName",
                                qty: "$products.qty",
                                price: "$products.price",
                                amount: "$products.amount",
                                total: "$products.total"
                            }
                        }
                    }
                }
            ];

            const result = await this.orderRepository
                .aggregate(pipeline)
                .toArray();

            if (!result.length) {
                return response(res, StatusCodes.NOT_FOUND, "Order not found");
            }

            return response(
                res,
                StatusCodes.OK,
                "Order details fetched successfully",
                result[0]
            );

        } catch (error: any) {
            return response(
                res,
                StatusCodes.INTERNAL_SERVER_ERROR,
                error.message || "Something went wrong"
            );
        }
    }

    // --------------------------------------------------
    // DELETE ORDER (SOFT DELETE)
    // --------------------------------------------------
    @Delete("/delete/:id")
    async deleteOrder(
        @Param("id") id: string,
        @Req() req: RequestWithUser,
        @Res() res: Response
    ) {
        try {
            if (!ObjectId.isValid(id)) {
                return response(res, StatusCodes.BAD_REQUEST, "Invalid order id");
            }

            const order = await this.orderRepository.findOneBy({
                _id: new ObjectId(id),
                isDelete: 0
            });

            if (!order) {
                return response(res, StatusCodes.NOT_FOUND, "Order not found");
            }

            order.isDelete = 1;
            order.updatedAt = new Date();
            order.updatedBy = new ObjectId(req.user.userId);

            await this.orderRepository.save(order);

            return response(
                res,
                StatusCodes.OK,
                "Order deleted successfully"
            );

        } catch (error: any) {
            return response(
                res,
                StatusCodes.INTERNAL_SERVER_ERROR,
                error.message || "Something went wrong"
            );
        }
    }
    @Get("/order-list")
    async listOrder(
        @Req() req: RequestWithUser,
        @Res() res: Response
    ) {
        try {
            const page = Math.max(Number(req.query.page) || 0, 0);
            const limit = Math.max(Number(req.query.limit) || 10, 1);
            const search = req.query.search?.toString();

            const match: any = { isDelete: 0 };

            if (search) {
                match.orderNumber = { $regex: search, $options: "i" };
            }

            const pipeline = [
                { $match: match },

                // MEMBER LOOKUP
                {
                    $lookup: {
                        from: "members",
                        localField: "memberId",
                        foreignField: "_id",
                        as: "member"
                    }
                },
                {
                    $unwind: {
                        path: "$member",
                        preserveNullAndEmptyArrays: true // ✅ FIX
                    }
                },

                // PRODUCT LOOKUP
                {
                    $lookup: {
                        from: "products",
                        localField: "productId",
                        foreignField: "_id",
                        as: "product"
                    }
                },
                {
                    $unwind: {
                        path: "$product",
                        preserveNullAndEmptyArrays: true // ✅ FIX
                    }
                },

                // FORMAT DATA FOR UI
                {
                    $project: {
                        orderNumber: 1,
                        memberName: { $ifNull: ["$member.fullName", ""] },
                        productName: { $ifNull: ["$product.productName", ""] },
                        quantity: { $ifNull: ["$quantity", 1] },
                        amount: { $ifNull: ["$product.price", 0] },
                        orderDate: "$createdAt",
                        status: { $ifNull: ["$status", "Pending"] }
                    }
                },

                { $sort: { orderDate: -1 } },

                {
                    $facet: {
                        data: [
                            { $skip: page * limit },
                            { $limit: limit }
                        ],
                        meta: [{ $count: "total" }]
                    }
                }
            ];

            const result = await this.orderRepository.aggregate(pipeline).toArray();

            // ✅ ALWAYS SAFE
            const data = result[0]?.data ?? [];
            const total = result[0]?.meta?.[0]?.total ?? 0;

            return pagination(total, data, limit, page, res);

        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }
    @Post("/generate/id")
    async getOrderId(@Req() req: RequestWithUser,
        @Res() res: Response) {
        const id = await generateOrderId();
        return response(res, StatusCodes.OK, 'Order Id Created successfully', id);
    }

}
