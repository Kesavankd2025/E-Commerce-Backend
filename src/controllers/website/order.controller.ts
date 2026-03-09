import { JsonController, Post, Body, Res, UseBefore, Req } from "routing-controllers";
import { Response } from "express";
import { StatusCodes } from "http-status-codes";
import { ObjectId } from "mongodb";
import { AppDataSource } from "../../data-source";
import { Order } from "../../entity/Order";
import { Customer } from "../../entity/Customer";
import { Product } from "../../entity/Product";
import { CreateOrderDto } from "../../dto/website/order.dto";
import { handleErrorResponse, response } from "../../utils";
import { AuthMiddleware } from "../../middlewares/AuthMiddleware";

@JsonController("/order")
export class WebsiteOrderController {
    private orderRepo = AppDataSource.getMongoRepository(Order);
    private customerRepo = AppDataSource.getMongoRepository(Customer);
    private productRepo = AppDataSource.getMongoRepository(Product);

    @Post("/create")
    @UseBefore(AuthMiddleware)
    async createOrder(@Body() body: CreateOrderDto, @Res() res: Response) {
        try {
            // Validate if userId is a valid ObjectId
            if (!ObjectId.isValid(body.userId)) {
                return response(res, StatusCodes.BAD_REQUEST, "Invalid user ID");
            }

            // Check if customer exists
            const customer = await this.customerRepo.findOneBy({
                _id: new ObjectId(body.userId),
                isDelete: 0
            });

            if (!customer) {
                return response(res, StatusCodes.NOT_FOUND, "Customer not found");
            }

            // Create new order
            const order = new Order();
            order.userId = new ObjectId(body.userId);

            // Map products and fetch real names if possible
            order.products = await Promise.all(body.products.map(async (p) => {
                const product = await this.productRepo.findOneBy({ _id: new ObjectId(p.productId) });
                return {
                    productId: new ObjectId(p.productId),
                    productName: product ? product.name : p.productName,
                    sku: p.sku,
                    combination: p.combination?.map(c => ({
                        attributeId: new ObjectId(c.attributeId),
                        value: c.value
                    })),
                    price: Number(p.price),
                    mrp: Number(p.mrp),
                    qty: Number(p.qty),
                    total: Number(p.total),
                    image: p.image
                };
            }));

            order.totalAmount = Number(body.totalAmount);
            order.taxAmount = Number(body.taxAmount);
            order.shippingCharge = Number(body.shippingCharge);
            order.grandTotal = Number(body.grandTotal);
            order.paymentMethod = body.paymentMethod;
            order.paymentStatus = body.paymentStatus || "Pending";
            order.orderStatus = body.orderStatus || "Pending";

            if (body.shippingMethodId) {
                order.shippingMethodId = new ObjectId(body.shippingMethodId);
            }

            order.address = {
                name: body.address.name,
                phone: body.address.phone,
                doorNo: body.address.doorNo,
                street: body.address.street,
                city: body.address.city,
                state: body.address.state,
                pincode: body.address.pincode
            };

            order.isActive = 1;
            order.isDelete = 0;
            order.createdAt = new Date();

            // Generate a simple Order ID if not provided
            order.orderId = `ORD-${Date.now()}`;

            await this.orderRepo.save(order);

            return response(res, StatusCodes.CREATED, "Order created successfully", order);
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }
}
