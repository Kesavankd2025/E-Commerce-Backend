import { Post, Body, Req, Res, UseBefore, JsonController, Put, Param, Get, Delete, QueryParam } from "routing-controllers";
import { ObjectId } from "mongodb";
import { StatusCodes } from "http-status-codes";
import { AuthMiddleware, AuthPayload } from "../../middlewares/AuthMiddleware";
import { AppDataSource } from "../../data-source";
import { SubCategory } from "../../entity/SubCategory";
import { CreateSubCategoryDto, UpdateSubCategoryDto } from "../../dto/admin/subCategory.dto";
import { handleErrorResponse, pagination, response } from "../../utils";
import { Request, Response } from "express";

interface RequestWithFiles extends Request {
    user: AuthPayload;
}

@UseBefore(AuthMiddleware)
@JsonController("/sub-category")
export class SubCategoryController {
    private repo = AppDataSource.getMongoRepository(SubCategory);

    @Post("/create")
    async create(
        @Req() req: RequestWithFiles,
        @Body() body: CreateSubCategoryDto,
        @Res() res: Response
    ) {
        try {
            const doc = new SubCategory();
            if (body.categoryId) doc.categoryId = new ObjectId(body.categoryId);
            if (body.name !== undefined) doc.name = body.name;
            if (body.slug !== undefined) doc.slug = body.slug;
            if (body.description !== undefined) doc.description = body.description;
            if (body.image !== undefined) doc.image = body.image;
            if (body.status !== undefined) doc.status = body.status;
            if (body.metaTitle !== undefined) doc.metaTitle = body.metaTitle;
            if (body.metaKeywords !== undefined) doc.metaKeywords = body.metaKeywords;
            if (body.metaDescription !== undefined) doc.metaDescription = body.metaDescription;

            doc.isDelete = 0;
            doc.createdBy = new ObjectId(req.user.userId);
            doc.createdAt = new Date();

            await this.repo.save(doc);
            return response(res, StatusCodes.CREATED, "SubCategory created successfully", doc);
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }

    @Put("/edit/:id")
    async edit(
        @Param("id") id: string,
        @Req() req: RequestWithFiles,
        @Body() body: UpdateSubCategoryDto,
        @Res() res: Response
    ) {
        try {
            if (!ObjectId.isValid(id)) return response(res, StatusCodes.BAD_REQUEST, "Invalid id");

            const doc = await this.repo.findOneBy({ _id: new ObjectId(id), isDelete: 0 });
            if (!doc) return response(res, StatusCodes.NOT_FOUND, "SubCategory not found");

            if (body.categoryId) doc.categoryId = new ObjectId(body.categoryId);
            if (body.name !== undefined) doc.name = body.name;
            if (body.slug !== undefined) doc.slug = body.slug;
            if (body.description !== undefined) doc.description = body.description;
            if (body.image !== undefined) doc.image = body.image;
            if (body.status !== undefined) doc.status = body.status;
            if (body.metaTitle !== undefined) doc.metaTitle = body.metaTitle;
            if (body.metaKeywords !== undefined) doc.metaKeywords = body.metaKeywords;
            if (body.metaDescription !== undefined) doc.metaDescription = body.metaDescription;

            doc.updatedBy = new ObjectId(req.user.userId);
            doc.updatedAt = new Date();

            await this.repo.save(doc);
            return response(res, StatusCodes.OK, "SubCategory updated successfully", doc);
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }

    @Get("/list")
    async list(
        @QueryParam("page") page: number = 0,
        @QueryParam("limit") limit: number = 10,
        @QueryParam("search") search: string,
        @QueryParam("status") status: boolean,
        @Res() res: Response
    ) {
        try {
            const match: any = { isDelete: 0 };
            if (status !== undefined) match.status = String(status) === 'true';
            if (search) {
                match.$or = [{ name: { $regex: search, $options: "i" } }, { slug: { $regex: search, $options: "i" } }, { description: { $regex: search, $options: "i" } }];
            }

            const pipeline: any[] = [
                { $match: match },
                { $sort: { createdAt: -1 } },
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
        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }

    @Get("/details/:id")
    async details(@Param("id") id: string, @Res() res: Response) {
        try {
            if (!ObjectId.isValid(id)) return response(res, StatusCodes.BAD_REQUEST, "Invalid id");

            const doc = await this.repo.findOneBy({ _id: new ObjectId(id), isDelete: 0 });
            if (!doc) return response(res, StatusCodes.NOT_FOUND, "SubCategory not found");

            return response(res, StatusCodes.OK, "Details fetched successfully", doc);
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }

    @Delete("/delete/:id")
    async delete(@Param("id") id: string, @Req() req: RequestWithFiles, @Res() res: Response) {
        try {
            if (!ObjectId.isValid(id)) return response(res, StatusCodes.BAD_REQUEST, "Invalid id");

            const doc = await this.repo.findOneBy({ _id: new ObjectId(id), isDelete: 0 });
            if (!doc) return response(res, StatusCodes.NOT_FOUND, "SubCategory not found");

            doc.isDelete = 1;
            doc.updatedBy = new ObjectId(req.user.userId);
            doc.updatedAt = new Date();
            await this.repo.save(doc);

            return response(res, StatusCodes.OK, "SubCategory deleted successfully");
        } catch (error: any) {
            return handleErrorResponse(error, res);
        }
    }
}
