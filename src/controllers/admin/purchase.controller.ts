import { Post, Body, Req, Res, UseBefore, JsonController, Put, Param, Get, Delete, QueryParam } from "routing-controllers";
import { ObjectId } from "mongodb";
import { StatusCodes } from "http-status-codes";
import { AuthMiddleware, AuthPayload } from "../../middlewares/AuthMiddleware";
import { AppDataSource } from "../../data-source";
import { PurchaseOrder } from "../../entity/PurchaseOrder";
import { Product } from "../../entity/Product";
import { Vendor } from "../../entity/Vendor";
import { VendorPayment } from "../../entity/VendorPayment";
import { handleErrorResponse, pagination, response } from "../../utils";
import { Request, Response } from "express";
import { logStockChange } from "../../utils/stockLogger";

interface RequestWithUser extends Request {
    user: AuthPayload;
}

@UseBefore(AuthMiddleware)
@JsonController("/purchase")
export class PurchaseController {
    private purchaseRepo = AppDataSource.getMongoRepository(PurchaseOrder);
    private productRepo = AppDataSource.getMongoRepository(Product);
    private vendorRepo = AppDataSource.getMongoRepository(Vendor);

    @Post("/create")
    async create(
        @Req() req: RequestWithUser,
        @Body() body: any,
        @Res() res: Response
    ) {
        try {
            const doc = new PurchaseOrder();
            doc.orderId = "PO-" + Date.now();
            doc.vendorId = new ObjectId(body.vendorId);
            doc.items = body.items.map((it: any) => ({
                ...it,
                productId: new ObjectId(it.productId),
                receivedQty: 0,
                isReceived: false
            }));
            doc.totalAmount = body.totalAmount;
            doc.otherCharges = Number(body.otherCharges || 0);
            doc.grandTotal = doc.totalAmount + doc.otherCharges;
            doc.paidAmount = Number(body.paidAmount || 0);
            doc.paymentMethod = body.paymentMethod || "Cash";
            doc.remarks = body.remarks;
            doc.status = "Pending";
            doc.isDelete = 0;
            doc.createdBy = new ObjectId(req.user.userId);
            doc.createdAt = new Date();

            // Set Payment Status
            if (doc.paidAmount === 0) {
                doc.paymentStatus = "Pending";
            } else if (doc.paidAmount >= doc.grandTotal) {
                doc.paymentStatus = "Paid";
            } else {
                doc.paymentStatus = "Partially Paid";
            }

            const savedPO = await this.purchaseRepo.save(doc);

            // If payment made, create payment history entry
            if (doc.paidAmount > 0) {
                const paymentRepo = AppDataSource.getMongoRepository(VendorPayment);
                const payment = new VendorPayment();
                payment.purchaseOrderId = savedPO.id;
                payment.vendorId = savedPO.vendorId;
                payment.amount = doc.paidAmount;
                payment.paymentMethod = doc.paymentMethod;
                payment.paymentDate = new Date();
                payment.createdBy = new ObjectId(req.user.userId);
                payment.createdAt = new Date();
                await paymentRepo.save(payment);
            }

            return response(res, StatusCodes.CREATED, "Purchase order created successfully", savedPO);
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }

    @Get("/list")
    async list(
        @QueryParam("page") page: number = 0,
        @QueryParam("limit") limit: number = 10,
        @QueryParam("vendorId") vendorId: string,
        @QueryParam("productId") productId: string,
        @QueryParam("fromDate") fromDate: string,
        @QueryParam("toDate") toDate: string,
        @Res() res: Response
    ) {
        try {
            const match: any = { isDelete: 0 };

            if (vendorId && ObjectId.isValid(vendorId)) {
                match.vendorId = new ObjectId(vendorId);
            }

            if (productId && ObjectId.isValid(productId)) {
                match["items.productId"] = new ObjectId(productId);
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

            const result = await this.purchaseRepo.aggregate(pipeline).toArray();
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

            const doc = await this.purchaseRepo.findOneBy({ _id: new ObjectId(id), isDelete: 0 });
            if (!doc) return response(res, StatusCodes.NOT_FOUND, "Purchase order not found");

            // Also fetch vendor info
            const vendor = await this.vendorRepo.findOneBy({ _id: doc.vendorId });
            (doc as any).vendorDetails = vendor;

            return response(res, StatusCodes.OK, "Details fetched successfully", doc);
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }

    @Put("/update-received/:id")
    async updateReceived(
        @Param("id") id: string,
        @Body() body: any, // { items, otherCharges, paymentMethod, paidAmount }
        @Req() req: RequestWithUser,
        @Res() res: Response
    ) {
        try {
            if (!ObjectId.isValid(id)) return response(res, StatusCodes.BAD_REQUEST, "Invalid id");

            const po = await this.purchaseRepo.findOneBy({ _id: new ObjectId(id), isDelete: 0 });
            if (!po) return response(res, StatusCodes.NOT_FOUND, "Purchase order not found");

            // Update global fields
            if (body.otherCharges !== undefined) po.otherCharges = Number(body.otherCharges);
            if (body.paymentMethod) po.paymentMethod = body.paymentMethod;

            for (const updateItem of body.items) {
                const poItem = po.items.find((item: any) =>
                (item.productId.toString() === updateItem.productId &&
                    JSON.stringify(item.variantCombination) === JSON.stringify(updateItem.variantCombination))
                );

                if (poItem && !poItem.isReceived) {
                    poItem.receivedQty = Number(updateItem.receivedQty);
                    poItem.purchasePrice = Number(updateItem.purchasePrice);
                    poItem.total = poItem.receivedQty * poItem.purchasePrice;
                    poItem.isReceived = true;

                    // IMPORTANT: Update Product Stock in Main DB
                    const product = await this.productRepo.findOneBy({ _id: poItem.productId });
                    if (product && product.attributes) {
                        const variantIdx = product.attributes.findIndex((attr: any) =>
                            JSON.stringify(attr.combination) === JSON.stringify(poItem.variantCombination)
                        );

                        if (variantIdx !== -1) {
                            const prevStock = Number(product.attributes[variantIdx].stock) || 0;
                            const receivedQty = Number(poItem.receivedQty);
                            product.attributes[variantIdx].stock = prevStock + receivedQty;
                            await this.productRepo.save(product);

                            // Log stock change
                            await logStockChange({
                                productId: product.id,
                                productName: product.name,
                                attributeId: product.attributes[variantIdx].sku,
                                variantLabel: "", // Can add variant description if needed
                                previousStock: prevStock,
                                quantity: receivedQty,
                                currentStock: product.attributes[variantIdx].stock,
                                type: "purchase",
                                referenceModel: "PurchaseOrder",
                                referenceId: po.id,
                                userId: new ObjectId(req.user.userId)
                            });
                        }
                    }
                }
            }

            // Re-calculate totals
            po.totalAmount = po.items.reduce((acc, it) => acc + (it.total || 0), 0);
            po.grandTotal = po.totalAmount + (po.otherCharges || 0);

            // Payment Handling
            if (body.paidAmount && Number(body.paidAmount) > 0) {
                const paymentRepo = AppDataSource.getMongoRepository(VendorPayment);
                const payment = new VendorPayment();
                payment.purchaseOrderId = po.id;
                payment.vendorId = po.vendorId;
                payment.amount = Number(body.paidAmount);
                payment.paymentMethod = body.paymentMethod || "Cash";
                payment.paymentDate = new Date();
                payment.createdAt = new Date();
                payment.createdBy = new ObjectId(req.user.userId);

                await paymentRepo.save(payment);
                po.paidAmount = (po.paidAmount || 0) + Number(body.paidAmount);
            }

            // Update Payment Status
            if (po.paidAmount >= po.grandTotal) {
                po.paymentStatus = "Paid";
            } else if (po.paidAmount > 0) {
                po.paymentStatus = "Partially Paid";
            } else {
                po.paymentStatus = "Pending";
            }

            // Check overall reception status
            const allReceived = po.items.every((it: any) => it.isReceived);
            if (allReceived) {
                po.status = "Received";
            } else if (po.items.some((it: any) => it.isReceived)) {
                po.status = "Partially Received";
            }

            po.updatedBy = new ObjectId(req.user.userId);
            po.updatedAt = new Date();

            await this.purchaseRepo.save(po);
            return response(res, StatusCodes.OK, "Stock & Payment updated successfully", po);
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }
}
