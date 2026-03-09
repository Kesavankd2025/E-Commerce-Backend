import { JsonController, Get, Param, QueryParams, Res, UseBefore, Put, Body } from "routing-controllers";
import { AppDataSource } from "../../data-source";
import { Customer } from "../../entity/Customer";
import { Address } from "../../entity/Address";
import { ObjectId } from "mongodb";
import { StatusCodes } from "http-status-codes";
import { response, pagination, handleErrorResponse } from "../../utils";
import { AuthMiddleware } from "../../middlewares/AuthMiddleware";

@JsonController("/admin/customers")
@UseBefore(AuthMiddleware)
export class AdminCustomerController {
    private repo = AppDataSource.getMongoRepository(Customer);
    private addressRepo = AppDataSource.getMongoRepository(Address);

    @Get("/list")
    async listCustomers(@QueryParams() query: any, @Res() res: any) {
        try {
            const page = Number(query.page) || 0;
            const limit = Number(query.limit) || 10;
            const skip = page * limit;

            const [customers, total] = await this.repo.findAndCount({
                where: { isDelete: { $ne: 1 } } as any,
                order: { createdAt: "DESC" } as any,
                take: limit,
                skip: skip
            });

            // For each customer, maybe we want to know their default address or address count? 
            // For now, simple list.

            return pagination(total, customers, limit, page, res);
        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }

    @Get("/details/:id")
    async getCustomerDetails(@Param("id") id: string, @Res() res: any) {
        try {
            if (!ObjectId.isValid(id)) return response(res, StatusCodes.BAD_REQUEST, "Invalid ID");

            const customer = await this.repo.findOneBy({ _id: new ObjectId(id), isDelete: 0 });
            if (!customer) return response(res, StatusCodes.NOT_FOUND, "Customer not found");

            // Fetch addresses for this customer
            const addresses = await this.addressRepo.find({
                where: { userId: new ObjectId(id), isDelete: 0 },
                order: { isDefault: "DESC" as any, createdAt: "DESC" }
            });

            return response(res, StatusCodes.OK, "Customer details fetched", {
                customer,
                addresses
            });
        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }

    @Put("/update-status/:id")
    async updateStatus(@Param("id") id: string, @Body() body: { isActive: boolean }, @Res() res: any) {
        try {
            if (!ObjectId.isValid(id)) return response(res, StatusCodes.BAD_REQUEST, "Invalid ID");
            const customer = await this.repo.findOneBy({ _id: new ObjectId(id) });
            if (!customer) return response(res, StatusCodes.NOT_FOUND, "Customer not found");

            customer.isActive = body.isActive;
            await this.repo.save(customer);

            return response(res, StatusCodes.OK, "Customer status updated");
        } catch (error) {
            return handleErrorResponse(error, res);
        }
    }
}
