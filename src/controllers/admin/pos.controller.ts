import { JsonController, Get, Post, Body, QueryParams, Res, UseBefore, Param } from "routing-controllers";
import { AppDataSource } from "../../data-source";
import { Order } from "../../entity/Order";
import { Customer } from "../../entity/Customer";
import { Product } from "../../entity/Product";
import { PaymentDetail } from "../../entity/PaymentDetail";
import { ObjectId } from "mongodb";
import { StatusCodes } from "http-status-codes";
import { response, pagination, handleErrorResponse } from "../../utils";
import { AuthMiddleware } from "../../middlewares/AuthMiddleware";
import { deductStockForOrder } from "../../utils/stockLogger";
import bcrypt from "bcryptjs";

@JsonController("/admin/pos")
@UseBefore(AuthMiddleware)
export class AdminPosController {
    private orderRepo = AppDataSource.getMongoRepository(Order);
    private customerRepo = AppDataSource.getMongoRepository(Customer);
    private productRepo = AppDataSource.getMongoRepository(Product);
    private paymentRepo = AppDataSource.getMongoRepository(PaymentDetail);

    @Get("/customers/search")
    async searchCustomers(@QueryParams() query: any, @Res() res: any) {
        try {
            const search = query.search?.trim();
            if (!search) return response(res, StatusCodes.OK, "Search term required", []);

            const customers = await this.customerRepo.find({
                where: {
                    $or: [
                        { fullName: { $regex: search, $options: "i" } },
                        { phoneNumber: { $regex: search, $options: "i" } }
                    ],
                    isDelete: 0
                } as any,
                take: 5
            });

            return response(res, StatusCodes.OK, "Customers fetched", customers);
        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }

    @Post("/customers/add")
    async addCustomer(@Body() body: any, @Res() res: any) {
        try {
            const { fullName, phoneNumber, address } = body;

            const exists = await this.customerRepo.findOneBy({ phoneNumber, isDelete: 0 });
            if (exists) return response(res, StatusCodes.BAD_REQUEST, "Mobile number already exists");

            const customer = new Customer();
            customer.fullName = fullName;
            customer.phoneNumber = phoneNumber;
            customer.address = address;
            customer.password = await bcrypt.hash("123456", 10); // Default password for POS created users
            customer.isActive = true;
            customer.isDelete = 0;

            await this.customerRepo.save(customer);
            return response(res, StatusCodes.CREATED, "Customer added", customer);
        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }

    @Get("/products/search")
    async searchProducts(@QueryParams() query: any, @Res() res: any) {
        try {
            const search = query.search?.trim();
            if (!search) return response(res, StatusCodes.OK, "Search term required", []);

            const products = await this.productRepo.find({
                where: {
                    $or: [
                        { name: { $regex: search, $options: "i" } },
                        { sku: { $regex: search, $options: "i" } }
                    ],
                    isDelete: 0,
                    status: true
                } as any,
                take: 10
            });

            return response(res, StatusCodes.OK, "Products fetched", products);
        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }

    @Post("/orders/create")
    async createOrder(@Body() body: any, @Res() res: any) {
        try {
            const {
                userId,
                products,
                totalAmount,
                taxAmount,
                shippingCharge,
                grandTotal,
                payments,
                address,
                overallDiscount
            } = body;

            const order = new Order();
            order.userId = userId ? new ObjectId(userId) : null;
            order.products = products; // Should contain variant details
            order.totalAmount = totalAmount;
            order.taxAmount = taxAmount;
            order.shippingCharge = shippingCharge || 0;
            order.grandTotal = grandTotal;
            order.overallDiscount = overallDiscount || 0;
            order.paymentMethod = payments.length > 1 ? "Multiple" : payments[0].method;
            order.paymentStatus = "Paid";
            order.orderStatus = "Delivered"; // POS orders are usually delivered immediately
            order.address = address;
            order.orderFrom = "POS";
            order.orderId = "POS-" + Date.now();
            order.isActive = 1;
            order.isDelete = 0;

            const savedOrder = await this.orderRepo.save(order);

            // Save detailed payment info
            const paymentDetail = new PaymentDetail();
            paymentDetail.orderId = savedOrder.id;
            paymentDetail.payments = payments;
            paymentDetail.totalAmount = grandTotal;
            paymentDetail.receivedAmount = payments.reduce((acc: number, p: any) => acc + Number(p.amount), 0);
            paymentDetail.balanceAmount = grandTotal - paymentDetail.receivedAmount;
            await this.paymentRepo.save(paymentDetail);

            // Deduct Stock
            await deductStockForOrder(savedOrder.products as any[], "order", "Order", savedOrder.id);

            return response(res, StatusCodes.CREATED, "Order created successfully", savedOrder);
        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }

    @Get("/orders/history")
    async getHistory(@QueryParams() query: any, @Res() res: any) {
        try {
            const page = Number(query.page) || 0;
            const limit = Number(query.limit) || 10;
            const skip = page * limit;

            const [orders, total] = await this.orderRepo.findAndCount({
                where: { orderFrom: "POS", isDelete: { $ne: 1 } } as any,
                order: { createdAt: "DESC" } as any,
                take: limit,
                skip: skip
            });

            return pagination(total, orders, limit, page, res);
        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }
}
