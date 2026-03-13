import { Get, JsonController, Res } from "routing-controllers";
import { Response } from "express";
import { StatusCodes } from "http-status-codes";
import { AppDataSource } from "../../data-source";
import { Banner } from "../../entity/Banner";
import { Category } from "../../entity/Category";
import { Product } from "../../entity/Product";
import { handleErrorResponse, response } from "../../utils";

@JsonController("/home")
export class WebsiteHomeController {
    private bannerRepo = AppDataSource.getMongoRepository(Banner);
    private categoryRepo = AppDataSource.getMongoRepository(Category);
    private productRepo = AppDataSource.getMongoRepository(Product);

    @Get("/data")
    async getHomeData(@Res() res: Response) {
        try {
            // Fetch active banners
            const banners = await this.bannerRepo.find({
                where: { status: true, isDelete: 0 },
                order: { createdAt: "DESC" }
            });

            // Fetch active categories with images for round display
            const categories = await this.categoryRepo.find({
                where: { status: true, isDelete: 0 },
                order: { displayOrder: "ASC" },
                take: 10
            });

            // Fetch latest products
            const latestProducts = await this.productRepo.find({
                where: { status: true, isDelete: 0 },
                order: { createdAt: "DESC" },
                take: 8
            });

            // Fetch featured/top products (can be logic based on reviews or specified flag)
            const featuredProducts = await this.productRepo.find({
                where: { status: true, isDelete: 0 },
                take: 8
            });

            return response(res, StatusCodes.OK, "Home data fetched", {
                banners,
                categories,
                latestProducts,
                featuredProducts
            });
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }
}
