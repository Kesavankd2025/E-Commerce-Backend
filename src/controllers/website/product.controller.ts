import { Get, JsonController, Param, QueryParam, Res } from "routing-controllers";
import { Response } from "express";
import { StatusCodes } from "http-status-codes";
import { ObjectId } from "mongodb";
import { AppDataSource } from "../../data-source";
import { Product } from "../../entity/Product";
import { handleErrorResponse, pagination, response } from "../../utils";

@JsonController("/product")
export class WebsiteProductController {
    private repo = AppDataSource.getMongoRepository(Product);

    @Get("/list")
    async list(
        @QueryParam("page") page: number = 0,
        @QueryParam("limit") limit: number = 20,
        @QueryParam("search") search: string,
        @QueryParam("categoryId") categoryId: string,
        @QueryParam("subCategoryId") subCategoryId: string,
        @QueryParam("brandId") brandId: string,
        @QueryParam("minPrice") minPrice: number,
        @QueryParam("maxPrice") maxPrice: number,
        @QueryParam("sortBy") sortBy: string = "createdAt", // "price_low", "price_high", "createdAt"
        @Res() res: Response
    ) {
        try {
            const match: any = { status: true, isDelete: 0 };

            if (search) {
                match.$or = [
                    { name: { $regex: search, $options: "i" } },
                    { slug: { $regex: search, $options: "i" } },
                    { shortDescription: { $regex: search, $options: "i" } }
                ];
            }

            if (categoryId) match.categoryId = new ObjectId(categoryId);
            if (subCategoryId) match.subCategoryId = new ObjectId(subCategoryId);
            if (brandId) match.brandId = new ObjectId(brandId);

            if (minPrice !== undefined || maxPrice !== undefined) {
                match.price = {};
                if (minPrice !== undefined) match.price.$gte = Number(minPrice);
                if (maxPrice !== undefined) match.price.$lte = Number(maxPrice);
            }

            const sort: any = {};
            if (sortBy === "price_low") sort.price = 1;
            else if (sortBy === "price_high") sort.price = -1;
            else sort[sortBy] = -1;

            const pipeline: any[] = [
                { $match: match },
                { $sort: sort },
                {
                    $facet: {
                        data: [{ $skip: page * limit }, { $limit: limit }],
                        meta: [{ $count: "total" }]
                    }
                }
            ];

            const result = await this.repo.aggregate(pipeline).toArray();
            const data = result[0]?.data || [];
            const total = result[0]?.meta[0]?.total || 0;

            return pagination(total, data, limit, page, res);
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }

    @Get("/details/:slug")
    async details(@Param("slug") slug: string, @Res() res: Response) {
        try {
            const product = await this.repo.findOneBy({ slug, status: true, isDelete: 0 });
            if (!product) {
                return response(res, StatusCodes.NOT_FOUND, "Product not found");
            }
            return response(res, StatusCodes.OK, "Product details fetched", product);
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }

    @Get("/related/:id")
    async related(@Param("id") id: string, @Res() res: Response) {
        try {
            const product = await this.repo.findOneBy({ _id: new ObjectId(id) });
            if (!product) return response(res, StatusCodes.NOT_FOUND, "Product not found");

            const related = await this.repo.find({
                where: {
                    categoryId: product.categoryId,
                    _id: { $ne: product.id },
                    status: true,
                    isDelete: 0
                },
                take: 4
            });

            return response(res, StatusCodes.OK, "Related products fetched", related);
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }
}
