import { JsonController, Get, Put, Body, Param, QueryParams, Res, UseBefore } from "routing-controllers";
import { AppDataSource } from "../../data-source";
import { Review } from "../../entity/Review";
import { Product } from "../../entity/Product";
import { Customer } from "../../entity/Customer";
import { ObjectId } from "mongodb";
import { StatusCodes } from "http-status-codes";
import { response, pagination, handleErrorResponse } from "../../utils";
import { AuthMiddleware } from "../../middlewares/AuthMiddleware";

@JsonController("/admin/reviews")
@UseBefore(AuthMiddleware)
export class AdminReviewController {
    private repo = AppDataSource.getMongoRepository(Review);
    private productRepo = AppDataSource.getMongoRepository(Product);
    private customerRepo = AppDataSource.getMongoRepository(Customer);

    @Get("/list")
    async listReviews(@QueryParams() query: any, @Res() res: any) {
        try {
            const page = Number(query.page) || 0;
            const limit = Number(query.limit) || 10;
            const skip = page * limit;

            const [reviews, total] = await this.repo.findAndCount({
                where: { isDelete: { $ne: 1 } } as any,
                order: { createdAt: "DESC" } as any,
                take: limit,
                skip: skip
            });

            // Populate Product and Customer names
            const populatedData = await Promise.all(reviews.map(async (review) => {
                const product = await this.productRepo.findOneBy({ _id: new ObjectId(review.productId) });
                const customer = await this.customerRepo.findOneBy({ _id: new ObjectId(review.userId) });
                return {
                    ...review,
                    productName: product ? product.name : "Unknown Product",
                    customerName: customer ? customer.fullName : "Unknown Customer"
                };
            }));

            return pagination(total, populatedData, limit, page, res);
        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }

    @Put("/update-status/:id")
    async updateStatus(@Param("id") id: string, @Body() body: { status: number }, @Res() res: any) {
        try {
            if (!ObjectId.isValid(id)) return response(res, StatusCodes.BAD_REQUEST, "Invalid ID");
            const review = await this.repo.findOneBy({ _id: new ObjectId(id) });
            if (!review) return response(res, StatusCodes.NOT_FOUND, "Review not found");

            review.status = body.status;
            await this.repo.save(review);

            return response(res, StatusCodes.OK, "Review status updated successfully");
        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }
}
