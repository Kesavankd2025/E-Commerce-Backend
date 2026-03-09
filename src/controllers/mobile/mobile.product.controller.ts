import {
  JsonController,
  Get,
  Res,
  QueryParams,
  Param,
  UseBefore,
} from "routing-controllers";
import { Response } from "express";
import { ObjectId } from "mongodb";
import { StatusCodes } from "http-status-codes";
import { AppDataSource } from "../../data-source";
import { Product } from "../../entity/Product";
import response from "../../utils/response";
import handleErrorResponse from "../../utils/commonFunction";
import pagination from "../../utils/pagination";
import { AuthMiddleware } from "../../middlewares/AuthMiddleware";

@UseBefore(AuthMiddleware)
@JsonController("/mobileproducts")
export class MobileProductController {
  private productRepository = AppDataSource.getMongoRepository(Product);

  @Get("/list")
  async listProducts(@QueryParams() query: any, @Res() res: Response) {
    try {
      const page = Math.max(Number(query.page) || 0, 0);
      const limit = Math.max(Number(query.limit) || 10, 1);
      const search = query.search?.toString();
      const categoryId = query.categoryId?.toString();

      const match: any = { isDelete: 0, isActive: 1 };

      if (search) {
        match.productName = { $regex: search, $options: "i" };
      }

      if (categoryId) {
        match.categoryId = new ObjectId(categoryId);
      }

      const pipeline = [
        { $match: match },
        { $sort: { createdAt: -1 } },
        {
          $lookup: {
            from: "Productcategories",
            localField: "categoryId",
            foreignField: "_id",
            as: "category",
          },
        },
        {
          $unwind: {
            path: "$category",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $project: {
            productName: 1,
            price: 1,
            description: 1,
            productImage: 1,
            categoryId: 1,
            categoryName: "$category.name",
            createdAt: 1,
          },
        },
        {
          $facet: {
            data: [{ $skip: page * limit }, { $limit: limit }],
            meta: [{ $count: "total" }],
          },
        },
      ];

      const result = await this.productRepository.aggregate(pipeline).toArray();
      const data = result[0]?.data || [];
      const total = result[0]?.meta?.[0]?.total || 0;

      return pagination(total, data, limit, page, res);
    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }

  @Get("/details/:id")
  async productDetails(@Param("id") id: string, @Res() res: Response) {
    try {
      if (!ObjectId.isValid(id)) {
        return response(
          res,
          StatusCodes.BAD_REQUEST,
          "Invalid product id",
          null,
        );
      }

      const product = await this.productRepository.findOneBy({
        id: new ObjectId(id),
        isDelete: 0,
        isActive: 1,
      });

      if (!product) {
        return response(res, StatusCodes.NOT_FOUND, "Product not found", null);
      }

      return response(
        res,
        StatusCodes.OK,
        "Product details fetched successfully",
        product,
      );
    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }
}
