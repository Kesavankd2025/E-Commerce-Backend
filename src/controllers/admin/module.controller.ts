import { JsonController, Get, Res, UseBefore } from "routing-controllers";
import { AppDataSource } from "../../data-source";
import { Modules } from "../../entity/Modules";
import { StatusCodes } from "http-status-codes";
import { response, handleErrorResponse } from "../../utils";
import { AuthMiddleware } from "../../middlewares/AuthMiddleware";

@JsonController("/module")
@UseBefore(AuthMiddleware)
export class ModuleController {
    private moduleRepo = AppDataSource.getMongoRepository(Modules);

    @Get("/")
    async getAllModules(@Res() res: any) {
        try {
            const modules = await this.moduleRepo.find({
                where: { isDelete: 0, isActive: 1 },
                select: ["id", "name"]
            });
            return response(res, StatusCodes.OK, "Modules fetched successfully", modules);
        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }
}
