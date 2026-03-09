import {
    JsonController,
    Post,
    Body,
    Res,
} from "routing-controllers";
import { AppDataSource } from "../../data-source";
import { MemberEnquiry } from "../../entity/MemberEnquiry";
import { Response } from "express";

@JsonController("/member-enquiry")
export class WebsiteMemberEnquiryController {
    private memberEnquiryRepository = AppDataSource.getMongoRepository(MemberEnquiry);

    @Post("/")
    async createMemberEnquiry(@Body() enquiryData: any, @Res() response: Response) {
        try {
            const {
                fullName,
                email,
                phoneNumber,
                companyName,
                dateOfBirth,
                position,
                businessCategory,
                referredBy,
                anniversary,
                doorNo,
                street,
                area,
                city,
                state,
                pincode,
                isWantSmsEmailUpdates
            } = enquiryData;

            const newEnquiry = this.memberEnquiryRepository.create({
                fullName,
                email,
                phoneNumber,
                companyName,
                dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
                position,
                businessCategory,
                referredBy,
                anniversary: anniversary ? new Date(anniversary) : null,
                address: {
                    doorNo,
                    street,
                    area,
                    city,
                    state,
                    pincode
                },
                isWantSmsEmailUpdates,
                createdAt: new Date(),
                updatedAt: new Date(),
                isDelete: 0,
            });

            await this.memberEnquiryRepository.save(newEnquiry);
            return response.status(201).json({ message: "Member enquiry submitted successfully" });
        } catch (error) {
            console.error("Error submitting member enquiry:", error);
            return response.status(500).json({ message: "Internal server error" });
        }
    }
}
