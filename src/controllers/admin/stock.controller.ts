import { Get, JsonController, Post, Body, Res, UseBefore, Param, QueryParam } from "routing-controllers";
import { Response } from "express";
import { StatusCodes } from "http-status-codes";
import { AppDataSource } from "../../data-source";
import { Product } from "../../entity/Product";
import { StockLog } from "../../entity/StockLog";
import { AuthMiddleware } from "../../middlewares/AuthMiddleware";
import { handleErrorResponse, response, pagination } from "../../utils";
import { ObjectId } from "mongodb";
import { logStockChange } from "../../utils/stockLogger";

@UseBefore(AuthMiddleware)
@JsonController("/stock")
export class StockController {
    private productRepo = AppDataSource.getMongoRepository(Product);
    private stockRepo = AppDataSource.getMongoRepository(StockLog);

    @Post("/update-manual")
    async updateManual(@Body() body: any, @Res() res: Response) {
        try {
            const { productId, variants, description, userId } = body;

            if (!productId || !variants || !Array.isArray(variants)) {
                return response(res, StatusCodes.BAD_REQUEST, "Product ID and variants are required");
            }

            const product = await this.productRepo.findOneBy({ _id: new ObjectId(productId) });
            if (!product) return response(res, StatusCodes.NOT_FOUND, "Product not found");

            if (!product.attributes) product.attributes = [];

            for (const v of variants) {
                // Find matching attribute in product
                const attrIndex = product.attributes.findIndex((a: any) => a.sku === v.sku);
                if (attrIndex !== -1) {
                    const prevStock = Number(product.attributes[attrIndex].stock) || 0;
                    const newStock = Number(v.newStock);
                    const quantity = newStock - prevStock;

                    product.attributes[attrIndex].stock = newStock;

                    // Log the change
                    await logStockChange({
                        productId: product.id,
                        productName: product.name,
                        attributeId: v.sku, // Store SKU as ID for now
                        variantLabel: v.variantLabel,
                        previousStock: prevStock,
                        quantity: quantity,
                        currentStock: newStock,
                        type: "physical",
                        description: description,
                        userId: userId ? new ObjectId(userId) : undefined
                    });
                }
            }

            await this.productRepo.save(product);

            return response(res, StatusCodes.OK, "Stock updated successfully");
        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }

    @Get("/logs")
    async getLogs(
        @QueryParam("productId") productId: string,
        @QueryParam("page") page: number = 0,
        @QueryParam("limit") limit: number = 10,
        @Res() res: Response
    ) {
        try {
            const match: any = { isDelete: 0 };
            if (productId) match.productId = new ObjectId(productId);

            const [data, total] = await this.stockRepo.findAndCount({
                where: match,
                order: { createdAt: "DESC" },
                take: limit,
                skip: page * limit
            });

            return pagination(total, data, limit, page, res);
        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }
}
