import {
  JsonController,
  Post,
  Body,
  Req,
  Res,
  UseBefore,
  Get,
  Param,
  QueryParams,
} from "routing-controllers";
import { Response, Request } from "express";
import { ObjectId } from "mongodb";
import { StatusCodes } from "http-status-codes";
import { AppDataSource } from "../../data-source";
import { Order, OrderStatus, PaymentStatus } from "../../entity/Order";
import { Product } from "../../entity/Product";
import { Member } from "../../entity/Member";
import { Chapter } from "../../entity/Chapter";
import { CreateMobileOrderDto } from "../../dto/mobile/MobileOrder.dto";
import response from "../../utils/response";
import handleErrorResponse from "../../utils/commonFunction";
import { generateOrderId } from "../../utils/id.generator";
import { AuthMiddleware, AuthPayload } from "../../middlewares/AuthMiddleware";
import pagination from "../../utils/pagination";
import imageService from "../../utils/upload";

interface RequestWithUser extends Request {
  user: AuthPayload;
}

@UseBefore(AuthMiddleware)
@JsonController("/orders")
export class MobileOrderController {
  private orderRepository = AppDataSource.getMongoRepository(Order);
  private productRepository = AppDataSource.getMongoRepository(Product);
  private memberRepository = AppDataSource.getMongoRepository(Member);
  private chapterRepository = AppDataSource.getMongoRepository(Chapter);

  @Post("/create")
  async createOrder(
    @Req() req: RequestWithUser,
    @Body() body: CreateMobileOrderDto,
    @Res() res: Response,
  ) {
    try {
      let { products, paymentMode } = body;
    
      if (typeof products === "string") {
        try {
          products = JSON.parse(products);
        } catch (e) {
          return response(
            res,
            StatusCodes.BAD_REQUEST,
            "Invalid products JSON format",
            null,
          );
        }
      }

      const userId = req.user.userId;

      // 1. Fetch Member Details
      const member = await this.memberRepository.findOneBy({
        _id: new ObjectId(userId),
      });

      if (!member) {
        return response(res, StatusCodes.NOT_FOUND, "Member not found", null);
      }

      
      // 2. Fetch Products and Calculate Totals
      if (!products || products.length === 0) {
        return response(
          res,
          StatusCodes.BAD_REQUEST,
          "No products provided",
          null,
        );
      }

      let grantTotal = 0;
      const orderProducts = [];

      for (const item of products) {
        const product = await this.productRepository.findOneBy({
          _id: new ObjectId(item.productId),
          isActive: 1,
          isDelete: 0,
        });

        if (!product) {
          return response(
            res,
            StatusCodes.BAD_REQUEST,
            `Product with ID ${item.productId} not found or inactive`,
            null,
          );
        }

        const total = product.price * item.qty;
        grantTotal += total;

        orderProducts.push({
          productId: product.id,
          price: product.price,
          qty: item.qty,
          amount: product.price, // unit price
          total: total,
        });
      }

      let paymentProofPath = null;
      if (paymentMode === "Online") {
        // @ts-ignore
        if (req.files && req.files.paymentProof) {
          // @ts-ignore
          const file = req.files.paymentProof;
          const extension = await imageService.validateImageFile(file);
          const fileName = `payment_proof_${Date.now()}${extension}`;

          const uploadResult = await imageService.fileUpload(
            file,
            "orders/payment_proofs",
            fileName,
            "",
          );

          if (!uploadResult) {
            return response(
              res,
              StatusCodes.INTERNAL_SERVER_ERROR,
              "Failed to upload payment proof",
              null,
            );
          }

          paymentProofPath = `orders/payment_proofs/${fileName}`;
        }
      }

      const order = new Order();
      order.orderId = await generateOrderId();
      order.memberId = member.id;
      order.products = orderProducts;
      order.grantTotal = grantTotal;
      order.status = OrderStatus.PENDING;
      order.paymentStatus = PaymentStatus.PENDING;
      order.paymentMode = paymentMode || "Offline";
      if (paymentProofPath) {
        order.paymentProof = paymentProofPath;
      }

      order.isActive = 1;
      order.isDelete = 0;
      order.createdBy = new ObjectId(userId);
      order.createdAt = new Date();

      await this.orderRepository.save(order);

      return response(
        res,
        StatusCodes.CREATED,
        "Order created successfully",
        order,
      );
    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }

  @Get("/list")
  async listOrders(
    @Req() req: RequestWithUser,
    @QueryParams() query: any,
    @Res() res: Response,
  ) {
    try {
      const userId = req.user.userId;
      const page = Math.max(Number(query.page) || 0, 0);
      const limit = Math.max(Number(query.limit) || 10, 1);

      const pipeline = [
        {
          $match: {
            memberId: new ObjectId(userId),
            isDelete: 0,
          },
        },
        { $sort: { createdAt: -1 } },
        {
          $project: {
            orderId: 1,
            orderDate: "$createdAt",
            status: 1,
            paymentStatus: 1,
            grantTotal: 1,
            itemCount: { $size: "$products" },
          },
        },
        {
          $facet: {
            data: [{ $skip: page * limit }, { $limit: limit }],
            meta: [{ $count: "total" }],
          },
        },
      ];

      const result = await this.orderRepository.aggregate(pipeline).toArray();
      const data = result[0]?.data || [];
      const total = result[0]?.meta?.[0]?.total || 0;

      return pagination(total, data, limit, page, res);
    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }

  @Get("/details/:id")
  async orderDetails(
    @Param("id") id: string,
    @Req() req: RequestWithUser,
    @Res() res: Response,
  ) {
    try {
      if (!ObjectId.isValid(id)) {
        return response(res, StatusCodes.BAD_REQUEST, "Invalid order id", null);
      }

      const order = await this.orderRepository.findOneBy({
        id: new ObjectId(id),
        memberId: new ObjectId(req.user.userId),
        isDelete: 0,
      });

      if (!order) {
        return response(res, StatusCodes.NOT_FOUND, "Order not found", null);
      }

      // Populate product details manually since we store snapshots but might want fresh images etc.
      // But for now, returning the order object is sufficient as it contains all snapshot info.
      // If we need to join with products to get images:

      const pipeline = [
        { $match: { _id: new ObjectId(id) } },
        { $unwind: "$products" },
        {
          $lookup: {
            from: "products",
            localField: "products.productId",
            foreignField: "_id",
            as: "productDetail",
          },
        },
        {
          $unwind: { path: "$productDetail", preserveNullAndEmptyArrays: true },
        },
        {
          $group: {
            _id: "$_id",
            orderId: { $first: "$orderId" },
            status: { $first: "$status" },
            paymentStatus: { $first: "$paymentStatus" },
            grantTotal: { $first: "$grantTotal" },
            createdAt: { $first: "$createdAt" },
            products: {
              $push: {
                productId: "$products.productId",
                productName: "$products.productName",
                price: "$products.price",
                qty: "$products.qty",
                total: "$products.total",
                productImage: "$productDetail.productImage",
              },
            },
          },
        },
      ];

      const result = await this.orderRepository.aggregate(pipeline).toArray();

      if (!result.length) {
        return response(res, StatusCodes.NOT_FOUND, "Order not found", null);
      }

      return response(
        res,
        StatusCodes.OK,
        "Order details fetched successfully",
        result[0],
      );
    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }
}
