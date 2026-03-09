import {
  JsonController,
  Post,
  Get,
  Put,
  Delete,
  Param,
  Body,
  Res,
  QueryParams,
  UseBefore,
  Req,
  Patch
} from "routing-controllers";
import { Response } from "express";
import { ObjectId } from "mongodb";
import { StatusCodes } from "http-status-codes";

import { AppDataSource } from "../../data-source";
import { AuthMiddleware } from "../../middlewares/AuthMiddleware";
import response from "../../utils/response";
import handleErrorResponse from "../../utils/commonFunction";
import pagination from "../../utils/pagination";
import { AuthPayload } from "../../middlewares/AuthMiddleware";
import { CreateProductCategoryDto, UpdateProductCategoryDto } from "../../dto/admin/ProductCategory.dto";
import { ProductCategory } from "../../entity/ProductCategory";
import { Product } from "../../entity/Product";

interface RequestWithUser extends Request {
  user: AuthPayload;
}

@UseBefore(AuthMiddleware)
@JsonController("/product-category")
export class ProductCategoryController {
  private productCategoryRepository = AppDataSource.getMongoRepository(ProductCategory);
  private productRepository = AppDataSource.getMongoRepository(Product);
  @Post("/")
  async createProductCategory(
    @Body() body: CreateProductCategoryDto,
    @Req() req: RequestWithUser,
    @Res() res: Response
  ) {
    try {
      const exists = await this.productCategoryRepository.findOneBy({
        name: body.name,
        isDelete: 0
      });

      if (exists) {
        return response(res, StatusCodes.CONFLICT, "Product category already exists");
      }

      const productCategory = new ProductCategory();
      productCategory.name = body.name;
      productCategory.categoryImage = body.categoryImage;
      productCategory.isActive = body.isActive ?? 1;
      productCategory.isDelete = 0;
      productCategory.createdBy = new ObjectId(req.user.userId);
      productCategory.updatedBy = new ObjectId(req.user.userId);

      const savedProductCategory = await this.productCategoryRepository.save(productCategory);

      return response(
        res,
        StatusCodes.CREATED,
        "Product category created successfully",
        savedProductCategory
      );
    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }

  @Get("/")
  async getAllProductCategories(
    @QueryParams() query: any,
    @Res() res: Response
  ) {
    try {
      const page = Number(query.page ?? 0);
      const limit = Number(query.limit ?? 0);

      const match = { isDelete: 0 };

      const operation: any[] = [];

      operation.push({ $match: match }, {
        $sort: {
          isActive: -1,
          createdAt: -1
        }
      },);

      if (limit > 0) {
        operation.push(
          { $skip: page * limit },
          { $limit: limit }
        );
      }

      const productCategories =
        await this.productCategoryRepository
          .aggregate(operation)
          .toArray();

      const totalCount =
        await this.productCategoryRepository.countDocuments(match);

      return pagination(
        totalCount,
        productCategories,
        limit,
        page,
        res
      );
    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }


  @Get("/active")
  async getActiveProductCategories(@Res() res: Response) {
    try {
      const productCategories = await this.productCategoryRepository.find({
        isDelete: 0,
        isActive: 1
      });
      return response(res, StatusCodes.OK, "Active product categories fetched successfully", productCategories);
    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }

  @Get("/:id")
  async getProductCategoryById(@Param("id") id: string, @Res() res: Response) {
    try {
      const productCategory = await this.productCategoryRepository.findOneBy({
        _id: new ObjectId(id),
        isDelete: 0
      });

      if (!productCategory) {
        return response(res, StatusCodes.NOT_FOUND, "Product category not found");
      }

      return response(res, StatusCodes.OK, "Product category fetched successfully", productCategory);
    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }

  @Put("/:id")
  async updateProductCategory(
    @Param("id") id: string,
    @Body() body: UpdateProductCategoryDto,
    @Req() req: RequestWithUser,
    @Res() res: Response
  ) {
    try {
      const productCategory = await this.productCategoryRepository.findOneBy({
        _id: new ObjectId(id),
        isDelete: 0
      });

      if (!productCategory) {
        return response(res, StatusCodes.NOT_FOUND, "Product category not found");
      }

      if (body.name) {
        const nameExists = await this.productCategoryRepository.findOne({
          where: {
            name: body.name,
            isDelete: 0,
            _id: { $ne: new ObjectId(id) }
          }
        });

        if (nameExists) {
          return response(
            res,
            StatusCodes.CONFLICT,
            "Product category name already exists"
          );
        }

        productCategory.name = body.name;
      }

      if (body.isActive !== undefined) {
        productCategory.isActive = body.isActive;
      }

      if (body.categoryImage) {
        productCategory.categoryImage = body.categoryImage;
      }

      productCategory.updatedBy = new ObjectId(req.user.userId);

      const updatedProductCategory =
        await this.productCategoryRepository.save(productCategory);

      return response(
        res,
        StatusCodes.OK,
        "Product category updated successfully",
        updatedProductCategory
      );
    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }


  @Delete("/:id")
  async deleteProductCategory(@Param("id") id: string, @Res() res: Response) {
    try {
      const categoryId = new ObjectId(id);

      const productCategory = await this.productCategoryRepository.findOneBy({
        _id: categoryId,
        isDelete: 0
      });

      if (!productCategory) {
        return response(
          res,
          StatusCodes.NOT_FOUND,
          "Product category not found"
        );
      }

      const productCount = await this.productRepository.countDocuments({
        categoryId: categoryId,
        isDelete: 0
      });

      if (productCount > 0) {
        return response(
          res,
          StatusCodes.CONFLICT,
          `Cannot delete category. ${productCount} product(s) are linked to this category.`
        );
      }

      productCategory.isDelete = 1;
      await this.productCategoryRepository.save(productCategory);

      return response(
        res,
        StatusCodes.OK,
        "Product category deleted successfully"
      );

    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }


  @Patch("/:id/toggle-active")
  async toggleActive(@Param("id") id: string, @Res() res: Response) {
    try {
      const productCategory = await this.productCategoryRepository.findOneBy({
        _id: new ObjectId(id),
        isDelete: 0
      });

      if (!productCategory) {
        return response(res, StatusCodes.NOT_FOUND, "Product category not found");
      }

      productCategory.isActive = productCategory.isActive === 1 ? 0 : 1;
      const updatedProductCategory = await this.productCategoryRepository.save(productCategory);

      return response(
        res,
        StatusCodes.OK,
        `Product category ${productCategory.isActive === 1 ? "enabled" : "disabled"} successfully`,
        updatedProductCategory
      );
    } catch (error) {
      return handleErrorResponse(error, res);
    }
  }
}
