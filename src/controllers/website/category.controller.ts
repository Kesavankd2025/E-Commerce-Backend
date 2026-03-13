import { Get, JsonController, Res } from "routing-controllers";
import { Response } from "express";
import { StatusCodes } from "http-status-codes";
import { AppDataSource } from "../../data-source";
import { Category } from "../../entity/Category";
import { SubCategory } from "../../entity/SubCategory";
import { handleErrorResponse, response } from "../../utils";

@JsonController("/category")
export class WebsiteCategoryController {
    private categoryRepo = AppDataSource.getMongoRepository(Category);
    private subCategoryRepo = AppDataSource.getMongoRepository(SubCategory);

    @Get("/list")
    async list(@Res() res: Response) {
        try {
            // Get all active categories sorted by displayOrder
            const categories = await this.categoryRepo.find({
                where: { status: true, isDelete: 0 },
                order: { displayOrder: "ASC", createdAt: "DESC" }
            });

            // Get all active sub-categories
            const subCategories = await this.subCategoryRepo.find({
                where: { status: true, isDelete: 0 },
                order: { displayOrder: "ASC" }
            });

            // Combine categories with their sub-categories
            const result = categories.map(cat => ({
                ...cat,
                subCategories: subCategories.filter(sub => sub.categoryId && sub.categoryId.toString() === cat.id.toString())
            }));

            return response(res, StatusCodes.OK, "Categories fetched successfully", result);
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }
}
