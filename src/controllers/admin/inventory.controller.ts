import { Get, JsonController, QueryParam, Res, UseBefore } from "routing-controllers";
import { Response } from "express";
import { AppDataSource } from "../../data-source";
import { Product } from "../../entity/Product";
import { AuthMiddleware } from "../../middlewares/AuthMiddleware";
import { handleErrorResponse, pagination } from "../../utils";

@UseBefore(AuthMiddleware)
@JsonController("/inventory")
export class InventoryController {
    private productRepo = AppDataSource.getMongoRepository(Product);

    @Get("/list")
    async list(
        @QueryParam("page") page: number = 0,
        @QueryParam("limit") limit: number = 10,
        @QueryParam("search") search: string,
        @Res() res: Response
    ) {
        try {
            const match: any = { isDelete: 0 };
            if (search) {
                match.name = { $regex: search, $options: "i" };
            }

            const pipeline: any[] = [
                { $match: match },
                {
                    $addFields: {
                        isLowStock: {
                            $cond: {
                                if: {
                                    $and: [
                                        { $gt: ["$lowStockAlert", 0] },
                                        { $isArray: "$attributes" },
                                        {
                                            $anyElementTrue: {
                                                $map: {
                                                    input: { $ifNull: ["$attributes", []] },
                                                    as: "attr",
                                                    in: { $lte: ["$$attr.stock", "$lowStockAlert"] }
                                                }
                                            }
                                        }
                                    ]
                                },
                                then: 1,
                                else: 0
                            }
                        },
                        totalStock: { $sum: "$attributes.stock" }
                    }
                },
                { $sort: { isLowStock: -1, createdAt: -1 } },
                {
                    $facet: {
                        data: [{ $skip: page * limit }, { $limit: limit }],
                        total: [{ $count: "count" }]
                    }
                }
            ];

            const result = await this.productRepo.aggregate(pipeline).toArray();
            const data = result[0]?.data || [];
            const total = result[0]?.total[0]?.count || 0;

            return pagination(total, data, limit, page, res);
        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }
}
