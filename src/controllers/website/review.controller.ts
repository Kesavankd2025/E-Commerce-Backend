import { JsonController, Post, Get, Body, Req, Res, UseBefore, QueryParam } from "routing-controllers";
import { Response } from "express";
import { StatusCodes } from "http-status-codes";
import { ObjectId } from "mongodb";
import { AppDataSource } from "../../data-source";
import { Review } from "../../entity/Review";
import { Order } from "../../entity/Order";
import { AuthMiddleware } from "../../middlewares/AuthMiddleware";
import { response, handleErrorResponse } from "../../utils";

@JsonController("/reviews")
export class WebsiteReviewController {
    private repo = AppDataSource.getMongoRepository(Review);
    private orderRepo = AppDataSource.getMongoRepository(Order);

    @Post("/add")
    @UseBefore(AuthMiddleware)
    async addReview(@Req() req: any, @Body() body: any, @Res() res: Response) {
        try {
            const { productId, orderId, rating, comment } = body;
            const userId = new ObjectId(req.user.userId);

            // Optional: Verify if the user actually purchased this product and it's delivered
            const order = await this.orderRepo.findOneBy({
                _id: new ObjectId(orderId),
                userId: userId,
                orderStatus: "Delivered"
            });

            if (!order) {
                return response(res, StatusCodes.BAD_REQUEST, "You can only review delivered orders.");
            }

            const review = new Review();
            review.userId = userId;
            review.productId = new ObjectId(productId);
            review.orderId = new ObjectId(orderId);
            review.combination = body.combination; // Accept optional combination
            review.rating = Number(rating);
            review.comment = comment;
            review.status = 0; // Default inactive until admin approves
            review.isDelete = 0;

            await this.repo.save(review);

            return response(res, StatusCodes.CREATED, "Review submitted successfully. It will be visible after approval.", review);
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }

    @Get("/product/:productId")
    async getProductReviews(@QueryParam("productId") productId: string, @Res() res: Response) {
        try {
            if (!ObjectId.isValid(productId)) return response(res, StatusCodes.BAD_REQUEST, "Invalid Product ID");

            const reviews = await this.repo.find({
                where: {
                    productId: new ObjectId(productId),
                    status: 1,
                    isDelete: 0
                },
                order: { createdAt: "DESC" }
            });

            return response(res, StatusCodes.OK, "Reviews fetched successfully", reviews);
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }
}
